import { createOutputCapture, createFrameGate, FRAME_OUTPUT_LIMIT } from './runtime-limits.js';
import { prepareJavaSources } from "./source-path.js";
import { disposeGameRuntime, invokeGameExport } from "./game-lifecycle.js";
import { acceptsSceneInput } from './input-transport.js';
import { formatJavaRuntimeError } from './java-errors.js';
import {parseAssertionOutput} from './assertion-output.js';
import {checkClassStructure} from './class-metadata.js';

const TEAVM_URLS = {
  // Official TeaVM Playground assets are vendored because the CDN does not expose
  // the binary files with CORS headers when the lab is served from localhost.
  runtime: "/vendor/teavm/cdn/compiler.wasm-runtime.js",
  compiler: "/vendor/teavm/cdn/compiler.wasm",
  sdk: "/vendor/teavm/cdn/compile-classlib-teavm.bin",
  classlib: "/vendor/teavm/cdn/runtime-classlib-teavm.bin",
};

let compilerState;
const gameKeys = new Set();
let gameRuntime;
let gameSize = { width: 600, height: 400 };

// --- lab-core: synchroniczny most do hosta (SharedArrayBuffer + Atomics) ---
// Java wywołuje __lab.* (przez @JSBody w engine.Lab) — worker blokuje się na
// Atomics.wait, wątek główny obsługuje wywołanie synchronicznie i budzi workera.
let labSAB = null;
let labAppExports = null;
const labJstr = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return labAppExports?.["teavm.stringToJs"] ? labAppExports["teavm.stringToJs"](v) : String(v); }
  catch { return String(v); }
};
function labInvoke(op, payload) {
  if (!labSAB) return "";
  const i32 = new Int32Array(labSAB);
  const u8 = new Uint8Array(labSAB);
  Atomics.store(i32, 0, 0);
  self.postMessage({ command: "lab-call", op, payload });
  Atomics.wait(i32, 0, 0);
  const len = Math.max(0, Atomics.load(i32, 1));
  return new TextDecoder().decode(u8.subarray(8, 8 + len));
}
self.__lab = {
  spawn: (name) => Number(labInvoke("spawn", { name: labJstr(name) })) || 0,
  destroy: (obj) => labInvoke("destroy", { objectId: obj }),
  get: (compId, prop) => labInvoke("get", { compId, prop: labJstr(prop) }),
  set: (compId, prop, value) => labInvoke("set", { compId, prop: labJstr(prop), value: labJstr(value) }),
  call: (compId, method, argsJson) => labInvoke("call", { compId, method: labJstr(method), argsJson: labJstr(argsJson) }),
  findComponent: (kind) => Number(labInvoke("findComponent", { kind: labJstr(kind) })) || 0,
  attachComponent: (obj, kind) => Number(labInvoke("attachComponent", { objectId: obj, kind: labJstr(kind) })) || 0,
  attachRenderer: (obj, specJson) => labInvoke("attachRenderer", { objectId: obj, specJson: labJstr(specJson) }),
  setPosition: (obj, x, y) => labInvoke("setPosition", { objectId: obj, x, y }),
  posX: (obj) => { const p = JSON.parse(labInvoke("getPosition", { objectId: obj }) || "null"); return p ? p.x : 0; },
  posY: (obj) => { const p = JSON.parse(labInvoke("getPosition", { objectId: obj }) || "null"); return p ? p.y : 0; },
  info: () => labInvoke("info", {}),
};

async function fetchBytes(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Int8Array(await response.arrayBuffer());
  } catch (error) {
    throw new Error(`TeaVM: nie udało się pobrać ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function initialize() {
  const [{ load }, compilerBytes, sdk, classlib] = await Promise.all([
    import(TEAVM_URLS.runtime),
    fetchBytes(TEAVM_URLS.compiler),
    fetchBytes(TEAVM_URLS.sdk),
    fetchBytes(TEAVM_URLS.classlib),
  ]);
  const compilerModule = await load(compilerBytes);
  const compiler = compilerModule.exports.createCompiler();
  compiler.setSdk(sdk);
  compiler.setTeaVMClasslib(classlib);
  compilerState = { compiler, load };
}

function diagnosticToJson(diagnostic) {
  return {
    type: diagnostic.type,
    severity: diagnostic.severity,
    fileName: diagnostic.fileName,
    lineNumber: diagnostic.lineNumber,
    columnNumber: diagnostic.columnNumber,
    message: diagnostic.message,
  };
}

function classVersions(compiler) {
  return compiler.listOutputFiles()
    .filter((name) => name.endsWith(".class"))
    .map((fileName) => {
      const bytes = compiler.getOutputFile(fileName);
      return {
        fileName,
        majorVersion: bytes && bytes.length >= 8 ? ((bytes[6] & 0xff) << 8) | (bytes[7] & 0xff) : null,
      };
    });
}

async function compileAndRun(message) {
  const { compiler, load } = compilerState;
  stopGameRuntime();
  const diagnostics = [];
  let phase = "javac";
  const registration = compiler.onDiagnostic((diagnostic) => diagnostics.push(diagnosticToJson(diagnostic)));
  try {
    compiler.clearSourceFiles();
    compiler.clearOutputFiles();
    for (const [fileName, source] of prepareJavaSources(message.files || {})) compiler.addSourceFile(fileName, source);

    self.postMessage({ command: "phase", id: message.id, phase: "Kompiluję kod Java w przeglądarce…" });
    if (!compiler.compile()) {
      return { command: "result", id: message.id, ok: false, phase, diagnostics, output: "" };
    }

    const versions = classVersions(compiler);
    const structureResults=checkClassStructure(Object.fromEntries(compiler.listOutputFiles().filter(name=>name.endsWith('.class')).map(name=>[name,compiler.getOutputFile(name)])),message.structureChecks);
    phase = "TeaVM → WebAssembly";
    self.postMessage({ command: "phase", id: message.id, phase: "Generuję WebAssembly…" });
    if (!compiler.generateWebAssembly({ outputName: "app", mainClass: message.mainClass })) {
      return { command: "result", id: message.id, ok: false, phase, diagnostics, classVersions: versions, output: "" };
    }

    phase = "uruchamianie runtime";
    self.postMessage({ command: "phase", id: message.id, phase: message.mode === "game" ? "Uruchamiam pętlę gry…" : "Uruchamiam main()…" });
    const generatedWasm = compiler.getWebAssemblyOutputFile("app.wasm");
    if (!generatedWasm || generatedWasm.length === 0) throw new Error("TeaVM nie wygenerował app.wasm.");
    const output = createOutputCapture();
    const errors = createOutputCapture();
    const assertionLines = new Map();
    let failedCriterion;
    const previousLog = console.log;
    const previousError = console.error;
    console.log = (...parts) => {
      const line = parts.map(String).join(" ");
      if (line.startsWith('LAB_CHECK_FAILED:')) failedCriterion ??= line.slice(0, 4000);
      if (/^__JAVA_LAB_CHECK__[\w-]+\t(?:PASS|FAIL)\t[^\r\n]*$/.test(line)) {
        const key = line.split('\t', 1)[0];
        if (!assertionLines.has(key) && assertionLines.size >= 256) throw new Error('Przekroczono limit asercji Java (256).');
        assertionLines.set(key, line.slice(0, 4000));
      } else output.push(line);
    };
    console.error = (...parts) => errors.push(parts.map(String).join(" "));
    const behaviorResults = [];
    try {
      for (const test of message.gameTests || []) {
        const probe = await load(generatedWasm);
        await probe.exports.main([]);
        probe.exports.resize?.(test.width || 600, test.height || 400);
        probe.exports.tick(0);
        for (const key of test.keys || []) probe.exports.setKey(key, true);
        for (let step = 0; step < (test.steps || 1); step++) probe.exports.tick(test.delta ?? 0.1);
        const frameText = String(probe.exports.frame());
        const rectLines = frameText.split("\n").filter((line) => line.startsWith("rect|"));
        const rectLine = test.texture
          ? frameText.split("\n").find(line => line.startsWith(`sprite|${test.texture}|`))
          : rectLines[test.rectIndex || 0];
        const rect = rectLine?.split("|").slice(test.texture ? 2 : 1, test.texture ? 6 : 5).map(Number);
        const passed = test.text !== undefined
          ? frameText.split("\n").some((line) => line.startsWith(`text|${test.text}|`))
          : Boolean(rect && rect.every(Number.isFinite) &&
          (!test.color || rectLine.split("|")[5] === test.color) &&
          Object.entries(test.expected || {}).every(([axis, value]) => Math.abs(rect[axis === "x" ? 0 : 1] - value) < 0.01));
        behaviorResults.push({ passed, label: test.label, detail: passed ? "Zachowanie gry jest poprawne." : `Niepoprawna pozycja gracza: ${rect?.join(", ") || "brak prostokąta"}` });
      }
      const app = await load(generatedWasm);
      labAppExports = app.exports;
      const mainResult = app.exports.main([]);
      if (message.mode !== "game") await mainResult;
      else startGameRuntime(app, message.id, message.frameAcknowledgements === true);
    } catch (error) {
      if (message.mainClass.endsWith('JavaTest') && failedCriterion) {
        return { command: 'result', id: message.id, ok: false, validationFailure: true,
          phase: 'sprawdzanie zadania', diagnostics, classVersions: versions,
          output: output.text,
          error: failedCriterion.slice('LAB_CHECK_FAILED:'.length) };
      }
      throw error;
    } finally {
      console.log = previousLog;
      console.error = previousError;
    }
    return {
      command: "result",
      id: message.id,
      ok: true,
      phase,
      diagnostics,
      classVersions: versions,
      output: output.text,
      assertionResults:[...parseAssertionOutput([...assertionLines.values()]).assertionResults,...structureResults],
      error: errors.text,
      behaviorResults,
    };
  } finally {
    if (typeof registration === "function") registration();
    else registration?.destroy?.();
  }
}

function startGameRuntime(app, gameId, frameAcknowledgements = false) {
  const tick = app.exports.tick;
  const frame = app.exports.frame;
  if (typeof tick !== "function" || typeof frame !== "function") {
    throw new Error("TeaVM nie wyeksportował tick() i frame() dla trybu gry.");
  }
  const frameGate = createFrameGate();
  let previousTime = performance.now();
  app.exports.resize?.(gameSize.width, gameSize.height);
  const drawFrame = (frameId) => {
    const now = performance.now();
    const delta = Math.min(0.1, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    tick(delta);
    const commands = String(frame() || "");
    const drawCommands = [];
    for (const line of commands.split("\n")) {
      if (!line) continue;
      const parts = line.split("|");
      if (parts[0] === "clear") drawCommands.push({ op: "clear", color: parts[1] });
      if (parts[0] === "rect") drawCommands.push({ op: "rect", x: Number(parts[1]), y: Number(parts[2]), width: Number(parts[3]), height: Number(parts[4]), color: parts[5],rotation:Number(parts[6]||0),scaleX:Number(parts[7]??1),scaleY:Number(parts[8]??1) });
      if (parts[0] === "circle") drawCommands.push({op:"circle",x:Number(parts[1]),y:Number(parts[2]),radius:Number(parts[3]),color:parts[4],rotation:Number(parts[5]||0),scaleX:Number(parts[6]??1),scaleY:Number(parts[7]??1)});
      if (parts[0] === "text") drawCommands.push({ op: "text", text: parts[1], x: Number(parts[2]), y: Number(parts[3]), color: parts[4], align: parts[5] || "center",fontSize:Number(parts[6]||16),baseline:parts[7]||"middle" });
      if (parts[0] === "sprite") drawCommands.push({ op: "sprite", texture: parts[1], x: Number(parts[2]), y: Number(parts[3]), width: Number(parts[4]), height: Number(parts[5]), rotation: Number(parts[6] || 0), scaleX: Number(parts[7] ?? 1), scaleY: Number(parts[8] ?? 1) });
      if (parts[0] === "progress") drawCommands.push({op:"progress",x:Number(parts[1]),y:Number(parts[2]),width:Number(parts[3]),height:Number(parts[4]),progress:Number(parts[5]),frame:parts[6],track:parts[7],fill:parts[8]});
      if (parts[0] === "ninepatch") drawCommands.push({op:"ninepatch",texture:parts[1],x:Number(parts[2]),y:Number(parts[3]),width:Number(parts[4]),height:Number(parts[5]),border:Number(parts[6])});
      if (parts[0] === "collider") drawCommands.push({op:"collider",shape:parts[1],x:Number(parts[2]),y:Number(parts[3]),width:Number(parts[4]),height:Number(parts[5]),trigger:parts[6]==="true"});
      if (parts[0] === "view") drawCommands.push({op:"view",x:Number(parts[1]),y:Number(parts[2])});
      if (parts[0] === "debug") drawCommands.push({op:"debug",enabled:parts[1]==="true"});
      if (parts[0] === "audio") drawCommands.push({op:"audio",payload:line.slice(6)});
      if (parts[0] === "lab") drawCommands.push({op:"lab",payload:line.slice(4)});
    }
    self.postMessage({ command: "game-draw", gameId, frameId, op: "frame", commands: drawCommands });
  };
  const emitFrame = () => {
    const frameId = frameAcknowledgements ? frameGate.begin() : undefined;
    if (frameAcknowledgements && frameId === undefined) return;
    const previousLog = console.log;
    const previousError = console.error;
    const logs = createOutputCapture(FRAME_OUTPUT_LIMIT);
    const errors = createOutputCapture(FRAME_OUTPUT_LIMIT);
    console.log = (...parts) => logs.push(parts.map(String).join(" "));
    console.error = (...parts) => errors.push(parts.map(String).join(" "));
    try { drawFrame(frameId); }
    finally {
      console.log = previousLog; console.error = previousError;
      for (const [level, capture] of [["log", logs], ["error", errors]]) {
        if (capture.text) self.postMessage({ command: "game-output", gameId, level, output: capture.text });
      }
    }
  };
  gameRuntime = { app, gameId, emitFrame, frameGate, interval: null };
  self.postMessage({ command: "game-draw", gameId, op: "clear", color: "#0b2033" });
  try { emitFrame(); }
  catch (error) { stopGameRuntime(); throw error; }
  gameRuntime.interval = setInterval(() => {
    try {
      emitFrame();
    } catch (error) {
      stopGameRuntime();
      self.postMessage({ command: "game-error", gameId, error: formatJavaRuntimeError(error) });
    }
  }, 16);
}

function stopGameRuntime() {
  const previousRuntime = gameRuntime;
  gameRuntime = undefined;
  gameKeys.clear();
  if (!previousRuntime) return;
  const previousLog = console.log, previousError = console.error;
  const logs = createOutputCapture(FRAME_OUTPUT_LIMIT);
  const errors = createOutputCapture(FRAME_OUTPUT_LIMIT);
  console.log = (...parts) => logs.push(parts.map(String).join(" "));
  console.error = (...parts) => errors.push(parts.map(String).join(" "));
  let ok = true;
  try { disposeGameRuntime(previousRuntime); }
  catch (error) {
    ok = false;
    self.postMessage({ command: "game-error", gameId: previousRuntime.gameId, error: formatJavaRuntimeError(error) });
  } finally {
    console.log = previousLog; console.error = previousError;
    for (const [level, capture] of [["log", logs], ["error", errors]]) {
      if (capture.text) self.postMessage({ command: "game-output", gameId: previousRuntime.gameId, level, output: capture.text });
    }
    self.postMessage({ command: "game-stopped", gameId: previousRuntime.gameId, ok });
  }
}

initialize()
  .then(() => self.postMessage({ command: "ready" }))
  .catch((error) => self.postMessage({ command: "init-error", error: error instanceof Error ? error.message : String(error) }));

self.addEventListener("message", async ({ data }) => {
  if (data?.command === 'lab-init') {
    labSAB = data.sab ?? null;
    return;
  }
  if (data?.command === 'game-frame-ack') {
    if (gameRuntime?.gameId === data.gameId) gameRuntime.frameGate.acknowledge(data.frameId);
    return;
  }
  if (data?.command === "game-debug") {
    invokeGameExport(gameRuntime,"setDebug",[Boolean(data.enabled)],stopGameRuntime,event=>self.postMessage(event));
    return;
  }
  if (data?.command === "game-resize") {
    gameSize = { width: data.width, height: data.height };
    invokeGameExport(gameRuntime, "resize", [data.width, data.height], stopGameRuntime, event => self.postMessage(event));
    return;
  }
  if (data?.command === "game-input") {
    if (!acceptsSceneInput(data, gameRuntime?.gameId)) return;
      if(data.kind==="clear"){gameKeys.clear();invokeGameExport(gameRuntime,"clearInput",[],stopGameRuntime,event=>self.postMessage(event));return;}
    if(data.kind==="pointer"){invokeGameExport(gameRuntime,"setPointer",[data.x,data.y],stopGameRuntime,event=>self.postMessage(event));return;}
    if(data.kind==="mouse"){invokeGameExport(gameRuntime,"setMouseButton",[data.button,data.pressed],stopGameRuntime,event=>self.postMessage(event));return;}
    if (data.pressed) gameKeys.add(data.key);
    else gameKeys.delete(data.key);
    invokeGameExport(gameRuntime, "setKey", [data.key, data.pressed], stopGameRuntime, event => self.postMessage(event));
    return;
  }
  if (data?.command === "game-world") {
    invokeGameExport(gameRuntime, "setWorldState", [data.state, data.rev], stopGameRuntime, event => self.postMessage(event));
    if (data.callResults) invokeGameExport(gameRuntime, "setCallResults", [data.callResults], stopGameRuntime, event => self.postMessage(event));
    return;
  }
  if (data?.command === "game-stop") {
    stopGameRuntime();
    gameKeys.clear();
    return;
  }
  if (data?.command !== "compile-and-run") return;
  try {
    self.postMessage(await compileAndRun(data));
  } catch (error) {
    self.postMessage({
      command: "result",
      id: data.id,
      ok: false,
      phase: error.phase || "TeaVM",
      code: error.code || "TEAVM_ERROR",
      error: formatJavaRuntimeError(error),
      stack: error instanceof Error ? error.stack : "",
      output: "",
    });
  }
});
