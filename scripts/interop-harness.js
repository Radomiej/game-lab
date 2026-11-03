import { WorldRegistry } from "/src/core/world.ts";
import { javascriptRuntime, typescriptRuntime } from "/src/runtimes/javascript.ts";
import { luaRuntime } from "/src/runtimes/lua.ts";
import { luauRuntime } from "/src/runtimes/luau.ts";
import { pythonRuntime } from "/src/runtimes/python.ts";
import { phpRuntime } from "/src/runtimes/php.ts";
import { cppRuntime } from "/src/runtimes/cpp.ts";
import { csharpRuntime } from "/src/runtimes/csharp.ts";
import { javaRuntime } from "/src/runtimes/java.ts";

const runtimes = {
  javascript: javascriptRuntime,
  typescript: typescriptRuntime,
  lua: luaRuntime,
  luau: luauRuntime,
  python: pythonRuntime,
  php: phpRuntime,
  cpp: cppRuntime,
  csharp: csharpRuntime,
  java: javaRuntime,
};
const extensions = {
  javascript: "js", typescript: "ts", lua: "lua", luau: "luau", python: "py",
  php: "php", cpp: "cpp", csharp: "cs", java: "java",
};
const targetLanguages = ["javascript", "lua", "luau", "python", "cpp"];
const outputs = [];
const errors = [];
const failures = [];
const tests = [];
const benchmarks = [];
const frameBenchmarks = [];
const scaleBenchmarks = [];
const onlyTest = new URL(location.href).searchParams.get("only") || "";
let frameTestName = "";
let javaFpsSamples = [];
const skipped = [
  { language: "php", reason: "PHP ma komponenty ze wznowieniem snapshotu przez callAsync; synchroniczne call() do PHP nie jest obsługiwane" },
  { language: "csharp", reason: "LabBridge nie udostępnia rejestracji metod C# jako komponentów" },
  { language: "java", reason: "Java wywołuje komponenty synchronicznie, ale nie rejestruje jeszcze własnych wywoływalnych metod jako komponentów" },
];
const skippedBehaviors = [
  { language: "cpp", feature: "Unicode in source string literals", reason: "JSCPP rejects non-ASCII characters in char literals; the common string round-trip checks ASCII pipe characters" },
  { language: "php", feature: "per-frame update callback", reason: "PHP runner executes a script once and has no persistent update hook" },
  { language: "cpp", feature: "per-frame update callback", reason: "JSCPP runner executes main() once and has no persistent update hook" },
  { language: "csharp", feature: "per-frame update callback", reason: "C# runner executes the compiled top-level script once and has no persistent update hook" },
];

const world = new WorldRegistry();
const host = {
  stdout: (text) => {
    const value = String(text);
    outputs.push(value);
    if (value.includes("JAVA_60_DONE")) {
      javaRuntime.stop();
    }
  },
  stderr: (text) => errors.push(String(text)),
  warn: (text) => errors.push(String(text)),
  draw() {},
  isKeyDown() { return false; },
  takePressed() { return new Set(); },
  width() { return 640; },
  height() { return 480; },
  readStdinLine() { return null; },
  async startGameLoop(update, init) {
    if (init) await init();
    const start = performance.now();
    let previous = start;
    let frames = 0;
    await new Promise((resolve, reject) => {
      const step = async (now) => {
        try {
          await update(Math.min((now - previous) / 1000, 0.1));
        } catch (error) {
          reject(error);
          return;
        }
        previous = now;
        frames++;
        if (frames === 60) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    frameBenchmarks.push({
      runtime: frameTestName,
      frames,
      elapsedMs: round(performance.now() - start),
      fps: round(frames * 1000 / (performance.now() - start)),
    });
  },
  world() { return world; },
  canvasEl: document.createElement("canvas"),
  onFps: undefined,
};

const oracleObject = world.spawnObject("Interop Oracle");
const oracleState = { value: 0, calls: 0 };
const oracleId = world.attach(oracleObject, "Oracle", "javascript", {
  get: (key) => oracleState[key],
  set: (key, value) => { oracleState[key] = value; },
  invoke(method, args) {
    oracleState.calls++;
    if (method === "echo") return args[0];
    if (method === "setAndReturn") {
      oracleState.value = args[0];
      return oracleState.value;
    }
    if (method.startsWith("relayTo")) {
      const targetId = world.find(method.slice("relayTo".length));
      return world.call(targetId, "setAndReturn", [args[1]]);
    }
    throw new Error(`Unknown Oracle method: ${method}`);
  },
  listMembers: () => [
    { name: "value", kind: "prop" },
    { name: "echo", kind: "method" },
    { name: "setAndReturn", kind: "method" },
  ],
});

function sourceFor(language, mode, { target = "Oracle", recipient = "LuaTarget", count = 0, value = 41 } = {}) {
  const cid = `lab.findComponent("${target}")`;
  const output = `RESULT:${value}|`;
  const relayKind = recipient;
  const relayMethod = `relayTo${relayKind}`;
  const relayArgs = `"${relayKind}",${value}`;
  if (mode === "string") {
    const text = language === "cpp" ? "tag|value" : "tag|雪";
    switch (language) {
      case "javascript": return `const id=${cid}; lab.setProp(id,"label","${text}"); console.log(lab.getProp(id,"label")==="${text}"?"STRING_OK":"STRING_BAD");`;
      case "typescript": return `const id: number=${cid}; lab.setProp(id,"label","${text}"); console.log(lab.getProp(id,"label")==="${text}"?"STRING_OK":"STRING_BAD");`;
      case "lua": return `local id=${cid}; lab.setProp(id,"label","${text}"); print(lab.getProp(id,"label")=="${text}" and "STRING_OK" or "STRING_BAD")`;
      case "luau": return `local id=${cid}; lab.setProp(id,"label","${text}"); print(if lab.getProp(id,"label")=="${text}" then "STRING_OK" else "STRING_BAD")`;
      case "python": return `id=${cid}\nlab.setProp(id, "label", "${text}")\nprint("STRING_OK" if lab.getProp(id, "label") == "${text}" else "STRING_BAD")`;
      case "php": return `<?php $id=Lab::findComponent("${target}"); Lab::setProp($id,"label","${text}"); echo Lab::getProp($id,"label")==="${text}"?"STRING_OK":"STRING_BAD";`;
      case "cpp": return `#include <lab.h>\nint main(){int id=lab_findComponent("${target}"); lab_setStr(id,"label","${text}"); lab_print(lab_getStr(id,"label")); return 0;}`;
      case "csharp": return `using System;\nvar id=Lab.FindComponent("${target}"); Lab.SetStr(id,"label","${text}"); Console.WriteLine(Lab.GetStr(id,"label")=="${text}"?"STRING_OK":"STRING_BAD");`;
      case "java": return `import engine.Lab; public class Main { public static void main(String[] a){int id=Lab.findComponent("${target}"); Lab.setProp(id,"label","${text}"); System.out.println(Lab.getProp(id,"label").equals("${text}")?"STRING_OK":"STRING_BAD");}}`;
    }
  }
  switch (language) {
    case "javascript":
      if (mode === "bench") return `const id=${cid}; for(let i=0;i<${count};i++) lab.call(id,"echo",i);`;
      if (mode === "loop") return `const id=${cid}; for(let i=0;i<${count};i++) {}`;
      if (mode === "relay") return `const id=${cid}, target=lab.findComponent("${relayKind}"); const r=lab.call(id,"${relayMethod}",${relayArgs}); console.log("${output}"+r+"|"+lab.getProp(target,"value"));`;
      return `const id=${cid}; const r=lab.call(id,"setAndReturn",${value}); console.log("${output}"+r+"|"+lab.getProp(id,"value"));`;
    case "typescript":
      if (mode === "bench") return `const id: number=${cid}; for(let i=0;i<${count};i++) lab.call(id,"echo",i);`;
      if (mode === "loop") return `const id: number=${cid}; for(let i=0;i<${count};i++) {}`;
      if (mode === "relay") return `const id: number=${cid}, target: number=lab.findComponent("${relayKind}"); const r: number=lab.call(id,"${relayMethod}",${relayArgs}) as number; console.log("${output}"+r+"|"+lab.getProp(target,"value"));`;
      return `const id: number=${cid}; const r: number=lab.call(id,"setAndReturn",${value}) as number; console.log("${output}"+r+"|"+lab.getProp(id,"value"));`;
    case "lua":
      if (mode === "bench") return `local id=${cid}; for i=1,${count} do lab.call(id,"echo",i) end`;
      if (mode === "loop") return `local id=${cid}; for i=1,${count} do end`;
      if (mode === "relay") return `local id=${cid}; local target=lab.findComponent("${relayKind}"); local r=lab.call(id,"${relayMethod}",${relayArgs}); print("${output}"..r.."|"..lab.getProp(target,"value"))`;
      return `local id=${cid}; local r=lab.call(id,"setAndReturn",${value}); print("${output}"..r.."|"..lab.getProp(id,"value"))`;
    case "luau":
      if (mode === "bench") return `local id=${cid}; for i=1,${count} do lab.call(id,"echo",i) end`;
      if (mode === "loop") return `local id=${cid}; for i=1,${count} do end`;
      if (mode === "relay") return `local id=${cid}; local target=lab.findComponent("${relayKind}"); local r=lab.call(id,"${relayMethod}",${relayArgs}); print("${output}"..tostring(r).."|"..tostring(lab.getProp(target,"value")))`;
      return `local id=${cid}; local r=lab.call(id,"setAndReturn",${value}); print("${output}"..tostring(r).."|"..tostring(lab.getProp(id,"value")))`;
    case "python":
      if (mode === "bench") return `id=${cid}\nfor i in range(${count}):\n    lab.call(id, "echo", i)`;
      if (mode === "loop") return `id=${cid}\nfor i in range(${count}):\n    pass`;
      if (mode === "relay") return `id=${cid}\ntarget=lab.findComponent("${relayKind}")\nr=lab.call(id, "${relayMethod}", "${relayKind}", ${value})\nprint("${output}" + str(r) + "|" + str(lab.getProp(target, "value")))`;
      return `id=${cid}\nr=lab.call(id, "setAndReturn", ${value})\nprint("${output}" + str(r) + "|" + str(lab.getProp(id, "value")))`;
    case "php":
      if (mode === "bench") return `<?php $id=Lab::findComponent("${target}"); for($i=0;$i<${count};$i++) Lab::callMethod($id,"echo",[$i]);`;
      if (mode === "loop") return `<?php $id=Lab::findComponent("${target}"); for($i=0;$i<${count};$i++) {}`;
      if (mode === "relay") return `<?php $id=Lab::findComponent("${target}"); $to=Lab::findComponent("${relayKind}"); $r=Lab::callMethod($id,"${relayMethod}",["${relayKind}",${value}]); echo "${output}".$r."|".Lab::getProp($to,"value")."\\n";`;
      return `<?php $id=Lab::findComponent("${target}"); $r=Lab::callMethod($id,"setAndReturn",[${value}]); echo "${output}".$r."|".Lab::getProp($id,"value")."\\n";`;
    case "cpp":
      if (mode === "bench") return `#include <lab.h>\nint main(){int id=lab_findComponent("${target}"); for(int i=0;i<${count};i++) lab_call(id,"echo","[1]"); return 0;}`;
      if (mode === "loop") return `#include <lab.h>\nint main(){int id=lab_findComponent("${target}"); for(int i=0;i<${count};i++) {} return 0;}`;
      if (mode === "relay") return `#include <iostream>\n#include <lab.h>\nusing namespace std;\nint main(){int id=lab_findComponent("${target}"); int to=lab_findComponent("${relayKind}"); double r=lab_call(id,"${relayMethod}","[\\\"${relayKind}\\\",${value}]"); cout<<"${output}"<<r<<"|"<<lab_getNum(to,"value")<<endl; return 0;}`;
      return `#include <iostream>\n#include <lab.h>\nusing namespace std;\nint main(){int id=lab_findComponent("${target}"); double r=lab_call(id,"setAndReturn","[${value}]"); cout<<"${output}"<<r<<"|"<<lab_getNum(id,"value")<<endl; return 0;}`;
    case "csharp":
      if (mode === "bench") return `var id=Lab.FindComponent("${target}"); for(var i=0;i<${count};i++) Lab.Call<int>(id,"echo",i);`;
      if (mode === "loop") return `var id=Lab.FindComponent("${target}"); for(var i=0;i<${count};i++) { }`;
      if (mode === "relay") return `using System;\nvar id=Lab.FindComponent("${target}"); var target=Lab.FindComponent("${relayKind}"); var r=Lab.Call<int>(id,"${relayMethod}","${relayKind}",${value}); Console.WriteLine("${output}"+r+"|"+Lab.GetNum(target,"value"));`;
      return `using System;\nvar id=Lab.FindComponent("${target}"); var r=Lab.Call<int>(id,"setAndReturn",${value}); Console.WriteLine("${output}"+r+"|"+Lab.GetNum(id,"value"));`;
    case "java":
      if (mode === "bench") return `import engine.Lab; public class Main { public static void main(String[] a){int id=Lab.findComponent("${target}"); for(int i=0;i<${count};i++) Lab.call(id,"echo","["+i+"]");}}`;
      if (mode === "loop") return `import engine.Lab; public class Main { public static void main(String[] a){int id=Lab.findComponent("${target}"); for(int i=0;i<${count};i++) { }}}`;
      if (mode === "relay") return `import engine.Lab; public class Main { public static void main(String[] a){int id=Lab.findComponent("${target}"); int to=Lab.findComponent("${relayKind}"); int c=Lab.call(id,"${relayMethod}","[\\\"${relayKind}\\\",${value}]"); String r=Lab.pollResult(c); System.out.println("${output}"+r+"|"+Lab.getProp(to,"value"));}}`;
      return `import engine.Lab; public class Main { public static void main(String[] a){int id=Lab.findComponent("${target}"); int c=Lab.call(id,"setAndReturn","[${value}]"); String r=Lab.pollResult(c); System.out.println("${output}"+r+"|"+Lab.getProp(id,"value"));}}`;
    default: throw new Error(`Unsupported caller runtime ${language}`);
  }
}

function targetSource(language, kind) {
  switch (language) {
    case "javascript": return `const obj=lab.spawn("${kind}"); lab.attachComponent(obj,"${kind}",{value:0,calls:0,echo(value){this.calls++;return value;},setAndReturn(value){this.value=value;return this.value;}});`;
    case "lua": return `local obj=lab.spawn("${kind}"); lab.attachComponent(obj,"${kind}",{value=0,calls=0,echo=function(self,value) self.calls=self.calls+1; return value end,setAndReturn=function(self,value) self.value=value; return self.value end})`;
    case "luau": return `local obj=lab.spawn("${kind}"); lab.attachComponent(obj,"${kind}",{value=0,calls=0,echo=function(self,value) self.calls+=1; return value end,setAndReturn=function(self,value) self.value=value; return self.value end})`;
    case "python": return `obj=lab.spawn("${kind}")\nclass Target:\n    value = 0\n    calls = 0\n    def echo(self, value):\n        self.calls += 1\n        return value\n    def setAndReturn(self, value):\n        self.value = value\n        return self.value\nlab.attachComponent(obj, "${kind}", Target())`;
case "cpp": return `#include <lab.h>
double targetValues[16384];
double targetCalls[16384];
double targetGet(int id, const char* property) {
  if (property[0] == 'c') return targetCalls[id];
  return targetValues[id];
}

void targetSet(int id, const char* property, double value) { targetValues[id] = value; }
double targetCall(int id, const char* method, double value) {
  if (method[0] == 'e') { targetCalls[id]++; return value; }
  if (method[0] == 's') { targetCalls[id]++; targetValues[id] = value; }
  return targetValues[id];
}
int main() {
  int object = lab_spawn("${kind}");
  int component = lab_attachComponent(object, "${kind}", "targetGet", "targetSet", "targetCall");
  targetValues[component] = 0;
  targetCalls[component] = 0;
  return 0;
}`;
  }
}

function scaleTargetSource(language, kind, count = 1000) {
  switch (language) {
    case "javascript": return `for(let i=0;i<${count};i++){const obj=lab.spawn("${kind}");lab.attachComponent(obj,"${kind}",{value:i,setAndReturn(value){this.value=value;return this.value;}});}`;
    case "typescript": return `for(let i=0;i<${count};i++){const obj=lab.spawn("${kind}");lab.attachComponent(obj,"${kind}",{value:i,setAndReturn(value:number){this.value=value;return this.value;}});}`;
    case "lua": return `for i=0,${count - 1} do local obj=lab.spawn("${kind}");lab.attachComponent(obj,"${kind}",{value=i,setAndReturn=function(self,value) self.value=value;return self.value end}) end`;
    case "luau": return `for i=0,${count - 1} do local obj=lab.spawn("${kind}");lab.attachComponent(obj,"${kind}",{value=i,setAndReturn=function(self,value) self.value=value;return self.value end}) end`;
    case "python": return `class ScaleTarget:\n    def __init__(self, value):\n        self.value = value\n    def setAndReturn(self, value):\n        self.value = value\n        return self.value\nfor i in range(${count}):\n    obj=lab.spawn("${kind}")\n    lab.attachComponent(obj, "${kind}", ScaleTarget(i))`;
    default: throw new Error(`Unsupported scale target runtime ${language}`);
  }
}

async function run(language, code, label = "main", allowStopped = false) {
  const fileLabel = language === "java" ? label[0].toUpperCase() + label.slice(1) : label;
  return runProject(language, `${fileLabel}.${extensions[language]}`, { [`${fileLabel}.${extensions[language]}`]: code }, allowStopped);
}

async function runProject(language, entry, files, allowStopped = false) {
  outputs.length = 0;
  errors.length = 0;
  const req = { entry, files };
  const result = await runtimes[language].run(req, host);
  if (result.status !== "ok" && !(allowStopped && result.status === "stopped")) {
    throw new Error(`${language} ${result.status}: ${result.message ?? ""}\n${errors.join("")}`);
  }
  return outputs.join("");
}

async function check(name, work) {
  if (onlyTest && !name.includes(onlyTest)) return;
  window.__INTEROP_PROGRESS__ = name;
  try {
    const detail = await work();
    tests.push({ name, status: "pass", detail: detail ?? "" });
  } catch (error) {
    failures.push({ name, error: error instanceof Error ? error.message : String(error) });
    tests.push({ name, status: "fail" });
  } finally {
    window.__INTEROP_PROGRESS__ = "";
  }
}

async function loadAll() {
  for (const language of Object.keys(runtimes)) {
    const runtime = runtimes[language];
    if (runtime.load) await runtime.load((message) => console.info(`[${language}] ${message}`));
  }
}

async function main() {
  await loadAll();

  await check("WorldRegistry releases bridge resources when components are removed", async () => {
    const isolated = new WorldRegistry();
    let disposed = 0;
    const objectId = isolated.spawnObject("cleanup");
    isolated.attach(objectId, "Disposable", "test", {
      get: () => undefined,
      set() {},
      invoke: () => undefined,
      dispose: () => { disposed++; },
    });
    isolated.destroyObject(objectId);
    if (disposed !== 1) throw new Error(`Expected one dispose call, received ${disposed}`);
    return `dispose calls=${disposed}`;
  });

  await check("WorldRegistry.callAsync resumes an async bridge and preserves sync providers", async () => {
    const isolated = new WorldRegistry();
    const objectId = isolated.spawnObject("async dispatch");
    const syncId = isolated.attach(objectId, "Sync", "test", { get: () => undefined, set() {}, invoke: () => 41 });
    const asyncId = isolated.attach(objectId, "Async", "test", {
      get: () => undefined,
      set() {},
      invoke: () => undefined,
      invokeAsync: async (_method, args) => Number(args[0]) + 1,
    });
    const syncResult = await isolated.callAsync(syncId, "answer");
    const asyncResult = await isolated.callAsync(asyncId, "resume", [41]);
    if (syncResult !== 41 || asyncResult !== 42) throw new Error(`Unexpected callAsync results: ${syncResult}, ${asyncResult}`);
    return `sync=${syncResult}, async=${asyncResult}`;
  });

  await check("PHP state component resumes each method call from an explicit JSON snapshot", async () => {
    await runProject("php", "setup.php", {
      "setup.php": `<?php $object = Lab::spawn("PHP state object"); Lab::attachStateComponent($object, "PhpStateTarget", "step.php", ["count" => 0, "label" => "雪|\\\\"]); $other = Lab::spawn("isolated PHP state object"); Lab::attachStateComponent($other, "PhpOtherTarget", "step.php", ["count" => 100, "label" => "other"]);`,
      "step.php": `<?php
function lab_component_dispatch($state, $method, $args) {
    if ($method === "fail") throw new RuntimeException("expected test failure");
    if ($method !== "add") throw new RuntimeException("unknown method: " . $method);
    $state["count"] += (int)($args[0] ?? 0);
    return ["state" => $state, "result" => $state["count"]];
}`,
    });
    const componentId = world.find("PhpStateTarget");
    if (componentId == null) throw new Error("PHP state component was not registered");
    const output = await run("javascript", `let didCall = false;
async function update() {
  if (didCall) return;
  didCall = true;
  const id = lab.findComponent("PhpStateTarget");
  const first = await lab.callAsync(id, "add", 2);
  const second = await lab.callAsync(id, "add", 3);
  const queued = await Promise.all([lab.callAsync(id, "add", 4), lab.callAsync(id, "add", 5)]);
  try { await lab.callAsync(id, "fail"); } catch (_) {}
  const otherId = lab.findComponent("PhpOtherTarget");
  const other = await lab.callAsync(otherId, "add", 2);
  console.log("PHP_STATE:" + [first, second, ...queued, lab.getProp(id, "count"), lab.getProp(id, "label"), other, lab.getProp(otherId, "count")].join(","));
}`);
    if (!output.includes("PHP_STATE:2,5,9,14,14,雪|\\,102,102")) throw new Error(`Unexpected PHP snapshot/resume result: ${JSON.stringify(output)}`);
    const tsOutput = await run("typescript", `let called = false;
async function update() {
  if (called) return;
  called = true;
  const id: number = lab.findComponent("PhpStateTarget");
  const value = await lab.callAsync(id, "add", 1);
  console.log("PHP_STATE_TS:" + value);
}`);
    if (!tsOutput.includes("PHP_STATE_TS:15")) throw new Error(`Expected TypeScript caller to resume PHP state at 15, got ${JSON.stringify(tsOutput)}`);
    return `${output.trim()} | ${tsOutput.trim()}`;
  });

  for (const language of ["javascript", "typescript", "lua", "luau", "python"]) {
    await check(`${language}: keeps isolated state across 1000 live components`, async () => {
      const kind = `Scale${language[0].toUpperCase()}${language.slice(1)}`;
      const registrationStarted = performance.now();
      await run(language, scaleTargetSource(language, kind), `scale-${language}`);
      const registrationMs = performance.now() - registrationStarted;
      const components = world.describe().filter((component) => component.lang === language && component.kind === kind);
      if (components.length !== 1000) throw new Error(`Expected 1000 ${language} components, registered ${components.length}`);

      const invokeStarted = performance.now();
      for (let i = 0; i < components.length; i++) {
        const result = world.call(components[i].id, "setAndReturn", [i + 1000]);
        if (result !== i + 1000) throw new Error(`${language} component ${i} returned ${result}`);
      }
      const invoke1000Ms = performance.now() - invokeStarted;
      const readStarted = performance.now();
      for (let i = 0; i < components.length; i++) {
        const value = world.get(components[i].id, "value");
        if (value !== i + 1000) throw new Error(`${language} component ${i} leaked another component's state: ${value}`);
      }
      const read1000Ms = performance.now() - readStarted;
      scaleBenchmarks.push({
        runtime: language === "typescript" ? "TypeScript" : language === "javascript" ? "JavaScript" : language[0].toUpperCase() + language.slice(1),
        components: components.length,
        registrationMs: round(registrationMs),
        invoke1000Ms: round(invoke1000Ms),
        invokePerCallUs: round(invoke1000Ms),
        read1000Ms: round(read1000Ms),
        stateIsolation: true,
      });
      return `registered=1000 in ${round(registrationMs)}ms; invoke=1000 in ${round(invoke1000Ms)}ms; read=1000 in ${round(read1000Ms)}ms`;
    });
  }

  if (onlyTest) {
    window.__INTEROP_REPORT__ = {
      createdAt: new Date().toISOString(), browser: navigator.userAgent, crossOriginIsolated,
      testCount: tests.length, passCount: tests.filter((test) => test.status === "pass").length,
      failures, tests, benchmarks, frameBenchmarks, scaleBenchmarks,
      skippedTargets: skipped, skippedBehaviors,
    };
    document.querySelector("#result").textContent = JSON.stringify(window.__INTEROP_REPORT__, null, 2);
    return;
  }

  for (const language of Object.keys(runtimes)) {
    await check(`${language}: synchronous write, call result, read-after-write`, async () => {
      const result = await run(language, sourceFor(language, "contract"));
      if (!result.includes("RESULT:41|41|41")) throw new Error(`Expected RESULT:41|41|41, got ${JSON.stringify(result)}`);
      return result.trim();
    });
  }

  for (const language of Object.keys(runtimes)) {
    await check(`${language}: string property round-trips pipe and Unicode`, async () => {
      const result = await run(language, sourceFor(language, "string"));
      const expected = language === "cpp" ? "tag|value" : "STRING_OK";
      if (!result.includes(expected)) throw new Error(`Expected ${expected}, got ${JSON.stringify(result)}`);
      if (result.includes("STRING_BAD")) throw new Error("String property changed during round-trip");
      return result.trim();
    });
  }

  const framePrograms = {
    javascript: `function update(dt){const id=lab.findComponent("Oracle");lab.call(id,"echo",dt);}`,
    typescript: `function update(dt:number){const id=lab.findComponent("Oracle");lab.call(id,"echo",dt);}`,
    lua: `function update(dt) local id=lab.findComponent("Oracle"); lab.call(id,"echo",dt) end`,
    luau: `function update(dt:number) local id=lab.findComponent("Oracle"); lab.call(id,"echo",dt) end`,
    python: `def update(dt):\n    id=lab.findComponent("Oracle")\n    lab.call(id, "echo", dt)`,
  };
  for (const [language, code] of Object.entries(framePrograms)) {
    await check(`${language}: 60 update ticks call a foreign component synchronously`, async () => {
      frameTestName = language;
      const before = oracleState.calls;
      await run(language, code, `frame-${language}`);
      const observed = oracleState.calls - before;
      if (observed !== 60) throw new Error(`Expected 60 calls during update, received ${observed}`);
      return `${observed} callbacks; ${frameBenchmarks.at(-1)?.fps ?? 0} updates/sec`;
    });
  }

  await check("java: 60 onUpdate ticks call a foreign component synchronously", async () => {
    if (!crossOriginIsolated || typeof SharedArrayBuffer === "undefined") throw new Error("SharedArrayBuffer unavailable");
    const before = oracleState.calls;
    const runFrames = async (source) => {
      javaFpsSamples = [];
      host.onFps = (fps) => { if (fps > 0) javaFpsSamples.push(fps); };
      const javaRun = run("java", source, "GameMain", true);
      let timeoutId;
      const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => {
        javaRuntime.stop();
        reject(new Error("Java update loop did not reach 60 frames within 15s"));
      }, 15_000); });
      try { await Promise.race([javaRun, timeout]); }
      finally { clearTimeout(timeoutId); host.onFps = undefined; }
      if (!javaFpsSamples.length) throw new Error("Java runtime did not report a frame-rate sample");
      return javaFpsSamples.at(-1);
    };
    const baselineFps = await runFrames(`public class GameMain extends Game { int frames; public void onCreate() {} public void onUpdate(double dt) { frames++; if(frames==120) System.out.println("JAVA_60_DONE"); } }`);
    frameBenchmarks.push({ runtime: "java (no interop)", frames: 120, fps: round(baselineFps), fpsSamples: javaFpsSamples.length });
    const javaFps = await runFrames(`import engine.Lab; public class GameMain extends Game { int frames; public void onCreate() {} public void onUpdate(double dt) { if(frames<120) { int id=Lab.findComponent("Oracle"); int call=Lab.call(id,"echo","["+frames+"]"); Lab.pollResult(call); } frames++; if(frames==120) System.out.println("JAVA_60_DONE"); } }`);
    const javaFrameCalls = oracleState.calls - before;
    if (javaFrameCalls !== 120) throw new Error(`Expected 120 Java interop calls, received ${javaFrameCalls}`);
    frameBenchmarks.push({ runtime: "java", frames: 120, fps: round(javaFps), fpsSamples: javaFpsSamples.length });
    return `${javaFrameCalls} callbacks; ${round(javaFps)} updates/sec`;
  });

  for (const target of targetLanguages) {
    const kind = `${target[0].toUpperCase()}${target.slice(1)}Target`;
    await check(`${target}: register callable component`, async () => {
      await run(target, targetSource(target, kind), `setup-${target}`);
      if (world.find(kind) == null) throw new Error(`Target component ${kind} was not registered`);
      return `${kind}#${world.find(kind)}`;
    });
  }

  await check("C++ keeps isolated state and dispatches across 1000 live components", async () => {
    const source = `#include <lab.h>
double batchValues[16384];
double batchGet(int id, const char* name) { return batchValues[id]; }
void batchSet(int id, const char* name, double value) { batchValues[id] = value; }
double batchCall(int id, const char* method, double value) {
  batchValues[id] = value;
  return batchValues[id];
}
int main() {
  for (int i = 0; i < 1000; i++) {
    int object = lab_spawn("CppBatch");
    int component = lab_attachComponent(object, "CppBatch", "batchGet", "batchSet", "batchCall");
    batchValues[component] = i;
  }
  return 0;
}`;
    const registerStarted = performance.now();
    await run("cpp", source, "cpp-batch");
    const registrationMs = performance.now() - registerStarted;
    const components = world.describe().filter((component) => component.lang === "cpp" && component.kind === "CppBatch");
    if (components.length !== 1000) throw new Error(`Expected 1000 C++ components, registered ${components.length}`);

    const invokeStarted = performance.now();
    for (let i = 0; i < components.length; i++) {
      const result = world.call(components[i].id, "setAndReturn", [i + 1000]);
      if (result !== i + 1000) throw new Error(`Component ${i} returned ${result}`);
    }
    const invoke1000Ms = performance.now() - invokeStarted;
    const readStarted = performance.now();
    for (let i = 0; i < components.length; i++) {
      const value = world.get(components[i].id, "value");
      if (value !== i + 1000) throw new Error(`Component ${i} leaked another component's state: ${value}`);
    }
    const read1000Ms = performance.now() - readStarted;
    scaleBenchmarks.push({
      runtime: "C++/JSCPP",
      components: components.length,
      registrationMs: round(registrationMs),
      invoke1000Ms: round(invoke1000Ms),
      invokePerCallUs: round(invoke1000Ms),
      read1000Ms: round(read1000Ms),
      stateIsolation: true,
    });
    return `registered=1000 in ${round(registrationMs)}ms; invoke=1000 in ${round(invoke1000Ms)}ms; read=1000 in ${round(read1000Ms)}ms`;
  });

  await check("PHP snapshot/resume stays isolated across 1000 components", async () => {
    const setupStarted = performance.now();
    await runProject("php", "setup.php", {
      "setup.php": `<?php for ($i = 0; $i < 1000; $i++) { $object = Lab::spawn("PHP scale object"); Lab::attachStateComponent($object, "PhpScale", "step.php", ["value" => $i]); }`,
      "step.php": `<?php
function lab_component_dispatch($state, $method, $args) {
    if ($method !== "add") throw new RuntimeException("unknown method: " . $method);
    $state["value"] += (int)($args[0] ?? 0);
    return ["state" => $state, "result" => $state["value"]];
}`,
    });
    const registrationMs = performance.now() - setupStarted;
    const components = world.describe().filter((component) => component.lang === "php" && component.kind === "PhpScale");
    if (components.length !== 1000) throw new Error(`Expected 1000 PHP state components, registered ${components.length}`);

    const resumeStarted = performance.now();
    const results = await Promise.all(components.map((component) => world.callAsync(component.id, "add", [1])));
    const resume1000Ms = performance.now() - resumeStarted;
    const readStarted = performance.now();
    for (let i = 0; i < components.length; i++) {
      const expected = i + 1;
      if (results[i] !== expected || world.get(components[i].id, "value") !== expected) {
        throw new Error(`PHP snapshot ${i} did not resume independently: result=${results[i]}, state=${world.get(components[i].id, "value")}`);
      }
    }
    const read1000Ms = performance.now() - readStarted;
    scaleBenchmarks.push({
      runtime: "PHP 8.4 snapshot/resume",
      components: components.length,
      registrationMs: round(registrationMs),
      invoke1000Ms: round(resume1000Ms),
      invokePerCallUs: round(resume1000Ms),
      read1000Ms: round(read1000Ms),
      stateIsolation: true,
    });
    return `registered=1000 in ${round(registrationMs)}ms; resumed=1000 in ${round(resume1000Ms)}ms; read=1000 in ${round(read1000Ms)}ms`;
  });

  for (const caller of Object.keys(runtimes)) {
    for (const target of targetLanguages) {
      const kind = `${target[0].toUpperCase()}${target.slice(1)}Target`;
      await check(`${caller} -> ${target}: execute target code and read its write`, async () => {
        const result = await run(caller, sourceFor(caller, "contract", { target: kind }));
        if (!result.includes("RESULT:41|41|41")) throw new Error(`Expected RESULT:41|41|41, got ${JSON.stringify(result)}`);
        return result.trim();
      });
    }
  }

  for (const caller of Object.keys(runtimes)) {
    for (const target of targetLanguages.filter((language) => language !== "javascript")) {
      const kind = `${target[0].toUpperCase()}${target.slice(1)}Target`;
      await check(`${caller} -> javascript -> ${target}: nested synchronous call`, async () => {
        const result = await run(caller, sourceFor(caller, "relay", { target: "Oracle", recipient: kind }));
        if (!result.includes("RESULT:41|41|41")) throw new Error(`Expected RESULT:41|41|41, got ${JSON.stringify(result)}`);
        return `${kind}: ${result.trim()}`;
      });
    }
  }

  const calls = Number(new URL(location.href).searchParams.get("calls") || 500);
  const samples = Number(new URL(location.href).searchParams.get("samples") || 5);
  for (const caller of Object.keys(runtimes)) {
    const baselineTimes = [];
    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      await run(caller, sourceFor(caller, "loop", { count: calls }));
      baselineTimes.push(performance.now() - start);
    }
    const baseline = median(baselineTimes);

    for (const target of targetLanguages) {
      const kind = `${target[0].toUpperCase()}${target.slice(1)}Target`;
      const times = [];
      let runError = null;
      for (let i = 0; i < samples; i++) {
        try {
          const targetId = world.find(`${target[0].toUpperCase()}${target.slice(1)}Target`);
          const beforeCalls = Number(world.get(targetId, "calls") ?? 0);
          const start = performance.now();
          await run(caller, sourceFor(caller, "bench", { target: kind, count: calls }));
          times.push(performance.now() - start);
          const afterCalls = Number(world.get(targetId, "calls") ?? 0);
          if (afterCalls - beforeCalls !== calls) {
            throw new Error(`Expected ${calls} calls to reach ${target}, observed ${afterCalls - beforeCalls}`);
          }
        } catch (error) {
          runError = error;
          break;
        }
      }
      if (runError) {
        failures.push({ name: `benchmark ${caller} -> ${target}`, error: String(runError) });
        continue;
      }
      const rawAdjustedMs = median(times) - baseline;
      const adjustedMs = Math.max(0, rawAdjustedMs);
      const rawPerCallMs = adjustedMs / calls;
      const belowResolution = rawAdjustedMs <= 0 || rawPerCallMs < 0.001;
      benchmarks.push({
        caller,
        target,
        iterations: calls,
        samples,
        baselineMs: round(baseline),
        batchMs: round(adjustedMs),
        perCallMs: belowResolution ? null : round(rawPerCallMs),
        upperBoundPerCallMs: belowResolution ? 0.001 : undefined,
        estimated60CallsPerFrameMs: belowResolution ? null : round(adjustedMs * 60 / calls),
        frameBudgetPercent: belowResolution ? null : round(adjustedMs * 60 / calls / 16.667 * 100),
        belowResolution,
      });
    }
  }

  window.__INTEROP_REPORT__ = {
    createdAt: new Date().toISOString(),
    browser: navigator.userAgent,
    crossOriginIsolated,
    testCount: tests.length,
    passCount: tests.filter((test) => test.status === "pass").length,
    failures,
    tests,
    benchmarks,
    frameBenchmarks,
    scaleBenchmarks,
    skippedTargets: skipped,
    skippedBehaviors,
    note: "Benchmark subtracts the median zero-call run from the median run of N calls. Compilation/runtime startup is included in both and largely cancels; results are approximate and are not an in-game frame profiler.",
  };
  document.querySelector("#result").textContent = JSON.stringify(window.__INTEROP_REPORT__, null, 2);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
function round(value) { return Math.round(value * 1_000_000) / 1_000_000; }

main().catch((error) => {
  window.__INTEROP_REPORT__ = {
    createdAt: new Date().toISOString(),
    crossOriginIsolated,
    testCount: tests.length,
    passCount: tests.filter((test) => test.status === "pass").length,
    failures: [{ name: "harness initialization", error: error instanceof Error ? error.stack : String(error) }, ...failures],
    tests,
    benchmarks,
    skippedTargets: skipped,
    skippedBehaviors,
  };
  document.querySelector("#result").textContent = JSON.stringify(window.__INTEROP_REPORT__, null, 2);
});
