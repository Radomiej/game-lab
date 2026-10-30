// Java (TeaVM → WASM) — port teavmRunner.js + gameInterop.js z java-lab.
// Kompilacja w workerze /vendor/teavm; tryb gry: GameLauncher (@JSExport)
// tick/frame + komendy rysowania w formacie renderer.js na canvasie LAB·BOY.

import type { LabRuntime, RunRequest, RunResult, LabHost } from "../core/protocol";
import { createLabFacade } from "../core/host";
import { prepareGameRequest } from "../engine/java/workspace";
import { createRenderer, type LabRenderer } from "../engine/renderer.js";
import { createLabAudio, type LabAudioOut } from "../engine/audio.js";
import { assetManifest } from "../engine/index.js";
import { userAssets } from "../core/userAssets";

const WORKER_URL = "/vendor/teavm/teavm.worker.js";
const GAME_W = 640;
const GAME_H = 480;
const COMPILE_TIMEOUT_MS = 90_000;

const CONTROL_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", " ",
]);
const normalizeKey = (key: string) =>
  key === " " ? "Space" : key.length === 1 ? key.toLowerCase() : key;

interface PendingRun {
  id: number;
  game: boolean;
  started: boolean;
  startupOutput: Array<{ level: string; text: string }>;
  resolve: (r: RunResult) => void;
  timeoutId: number;
}

let worker: Worker | undefined;
let readyPromise: Promise<void> | undefined;
let nextId = 0;
let pending: PendingRun | undefined;
let paused = false;
let heldFrameId: number | undefined;
let debugColliders = false;
let audioOut: LabAudioOut | undefined;
let detachInput: (() => void) | undefined;
let renderer: LabRenderer | undefined;
let assetsLoaded: Promise<void> | undefined;
let lastView = { x: 0, y: 0 };

function javaRenderer(): LabRenderer {
  if (!renderer) {
    renderer = createRenderer(assetManifest);
    assetsLoaded = renderer.load(window, "/game-assets/");
  }
  // tekstury użytkownika (dropzone) → wpis w manifeście + obraz @user:
  for (const a of assetManifest.assets) {
    if (!renderer.entries.has(a.key)) renderer.entries.set(a.key, a);
  }
  for (const u of userAssets.list()) {
    if (u.kind === "image" && u.image) renderer.images.set(`@user:${u.name}`, u.image);
  }
  return renderer;
}

function resetWorker() {
  detachInput?.();
  detachInput = undefined;
  worker?.terminate();
  worker = undefined;
  readyPromise = undefined;
  if (pending) {
    clearTimeout(pending.timeoutId);
    pending.resolve({ status: "runtime-error", message: "TeaVM worker zakończył się błędem." });
    pending = undefined;
  }
}

function ensureWorker(): Promise<void> {
  if (readyPromise) return readyPromise;
  worker = new Worker(WORKER_URL, { type: "module" });
  const w = worker;
  readyPromise = new Promise<void>((resolve, reject) => {
    w.addEventListener("message", (ev) => {
      if (ev.data?.command === "ready") resolve();
      if (ev.data?.command === "init-error") reject(new Error(ev.data.error ?? "TeaVM init error"));
    });
    w.addEventListener("error", (ev) => reject(new Error(ev.message || "TeaVM worker error")));
  });
  w.addEventListener("message", onMessage);
  w.addEventListener("error", () => resetWorker());
  w.postMessage({ command: "initialize" });
  return readyPromise;
}

function handleAudio(payload: string) {
  try {
    const cmd = JSON.parse(payload);
    audioOut ||= createLabAudio().createAudio({ window });
    if (cmd?.cmd === "note") audioOut.playNote(cmd.note, { beats: cmd.beats ?? 1, wave: cmd.wave ?? "square", tempo: cmd.tempo ?? 120 });
    else if (cmd?.cmd === "song") audioOut.playSong(cmd.song, { loop: Boolean(cmd.loop) });
    else if (cmd?.cmd === "stop") audioOut.stop();
  } catch {
    /* nieznany payload audio */
  }
}

function drawCommand(ctx: CanvasRenderingContext2D, cmd: Record<string, unknown>) {
  if (cmd.op === "clear") {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = (cmd.color as string) || "#0b2033";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    return;
  }
  if (cmd.op === "view") {
    lastView = { x: Number(cmd.x) || 0, y: Number(cmd.y) || 0 };
    return;
  }
  if (cmd.op === "debug") {
    debugColliders = Boolean(cmd.enabled);
    return;
  }
  if (cmd.op === "collider") {
    if (!debugColliders) return;
    ctx.save();
    try {
      ctx.strokeStyle = cmd.trigger ? "#64e9ff" : "#ffe38a";
      ctx.lineWidth = 1.5;
      ctx.setLineDash(cmd.trigger ? [4, 3] : []);
      if (cmd.shape === "circle") {
        ctx.beginPath();
        ctx.arc(Number(cmd.x), Number(cmd.y), Number(cmd.width) / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(
          Number(cmd.x) - Number(cmd.width) / 2,
          Number(cmd.y) - Number(cmd.height) / 2,
          Number(cmd.width),
          Number(cmd.height),
        );
      }
    } finally {
      ctx.restore();
    }
    return;
  }
  if (cmd.op === "audio") {
    handleAudio(String(cmd.payload ?? ""));
    return;
  }
  if (cmd.op === "lab") {
    applyLabOp(String(cmd.payload ?? ""));
    return;
  }
  javaRenderer().draw(ctx, cmd);
}

function attachInput(canvas: HTMLCanvasElement, gameId: number) {
  const post = (packet: Record<string, unknown>) =>
    worker?.postMessage({ command: "game-input", gameId, ...packet });
  const toLogical = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * GAME_W,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * GAME_H,
    };
  };
  const keys = new Set<string>();
  const buttons = new Set<number>();
  const onKey = (e: KeyboardEvent, pressed: boolean) => {
    if (CONTROL_KEYS.has(e.key) || CONTROL_KEYS.has(e.key.toLowerCase())) e.preventDefault();
    const key = normalizeKey(e.key);
    if (pressed) keys.add(key); else keys.delete(key);
    post({ key, pressed });
  };
  const onMove = (e: PointerEvent) => post({ kind: "pointer", ...toLogical(e) });
  const onDown = (e: PointerEvent) => {
    canvas.focus();
    onMove(e);
    buttons.add(e.button);
    canvas.setPointerCapture?.(e.pointerId);
    post({ kind: "mouse", button: e.button, pressed: true });
  };
  const onUp = (e: PointerEvent) => {
    onMove(e);
    buttons.delete(e.button);
    post({ kind: "mouse", button: e.button, pressed: false });
  };
  const onBlur = () => {
    keys.forEach((k) => post({ key: k, pressed: false }));
    keys.clear();
    buttons.clear();
    post({ kind: "clear" });
  };
  const kd = (e: Event) => onKey(e as KeyboardEvent, true);
  const ku = (e: Event) => onKey(e as KeyboardEvent, false);
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", kd);
  canvas.addEventListener("keyup", ku);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onBlur);
  canvas.addEventListener("blur", onBlur);
  detachInput = () => {
    canvas.removeEventListener("keydown", kd);
    canvas.removeEventListener("keyup", ku);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onBlur);
    canvas.removeEventListener("blur", onBlur);
  };
}

function formatDiagnostics(diagnostics: unknown): string {
  if (!Array.isArray(diagnostics)) return "";
  return diagnostics
    .map((d: Record<string, unknown>) => {
      const where = [d.fileName ?? d.file, d.line].filter(Boolean).join(":");
      return `${where ? where + ": " : ""}${d.message ?? d.text ?? String(d)}`;
    })
    .join("\n");
}

// --- Interop Java↔świat ---
// ZAPISY: Java emituje "lab|..." w strumieniu klatki (GameCanvas.frame()+Lab.drain())
// — aplikujemy je w kolejności emisji, w tej samej klatce (deterministyczne).
// ODCZYTY: snapshot świata pchany do workera po każdej klatce (game-world).
// SAB+lab-call zostaje jako ścieżka na wypadek powrotu jso (dziś: uśpiona).
let labSab: SharedArrayBuffer | undefined;
let labFacade: ReturnType<typeof createLabFacade> | undefined;
const labEncoder = new TextEncoder();
// Stan komponentów zadeklarowanych z Javy (pushProp publikuje pola do IDE).
const javaCompState = new Map<number, Record<string, unknown>>();
// Tokeny klienta z Javy (<0) → prawdziwe id w WorldRegistry.
const javaTokens = new Map<number, number>();
let javaCallResults = "";
const JAVA_PROP_LIMIT = 24;

function coerce(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function unesc(s: string): string {
  return s.replace(/\\p/g, "|").replace(/\\\\/g, "\\");
}

function resolveHandle(handle: number): number {
  return handle < 0 ? (javaTokens.get(handle) ?? 0) : handle;
}

// "lab|spawn|-1|Enemy" itd. — linia z Lab.drain() doklejona do frame().
function applyLabOp(line: string) {
  const lab = labFacade;
  if (!lab) return;
  const p = line.split("|");
  try {
    switch (p[0]) {
      case "spawn": {
        const token = Number(p[1]);
        const id = lab.spawn(unesc(p.slice(2).join("|")));
        javaTokens.set(token, id);
        break;
      }
      case "attachComponent": {
        const token = Number(p[1]);
        const obj = resolveHandle(Number(p[2]));
        if (!obj) return;
        const state: Record<string, unknown> = {};
        const cid = lab.attachBridge(obj, unesc(p.slice(3).join("|")), {
          get: (k) => state[k],
          set: (k, v) => {
            state[k] = v;
          },
          invoke: () => undefined,
          listMembers: () => Object.keys(state).map((k) => ({ name: k, kind: "prop" as const })),
        });
        javaCompState.set(cid, state);
        javaTokens.set(token, cid);
        break;
      }
      case "attachRenderer": {
        const obj = resolveHandle(Number(p[1]));
        if (obj) lab.attachRenderer(obj, JSON.parse(unesc(p.slice(2).join("|")) || "{}"));
        break;
      }
      case "setPosition": {
        const obj = resolveHandle(Number(p[1]));
        if (obj) lab.setPosition(obj, Number(p[2]), Number(p[3]));
        break;
      }
      case "destroy": {
        const obj = resolveHandle(Number(p[1]));
        if (obj) lab.destroyObject(obj);
        break;
      }
      case "set": {
        const cid = resolveHandle(Number(p[1]));
        if (!cid) return;
        const v = coerce(unesc(p.slice(3).join("|")));
        if (javaCompState.has(cid)) javaCompState.get(cid)![unesc(p[2])] = v;
        else lab.setProp(cid, unesc(p[2]), v);
        break;
      }
      case "push": {
        const cid = resolveHandle(Number(p[1]));
        const state = javaCompState.get(cid);
        if (state) state[unesc(p[2])] = unesc(p.slice(3).join("|"));
        break;
      }
      case "call": {
        const callId = p[1];
        const cid = resolveHandle(Number(p[2]));
        let res: unknown;
        if (cid) {
          const args = JSON.parse(unesc(p.slice(4).join("|")) || "[]");
          res = lab.call(cid, unesc(p[3]), ...(Array.isArray(args) ? args : [args]));
        }
        javaCallResults += `callres|${callId}|${res === undefined ? "" : JSON.stringify(res)}\n`;
        break;
      }
    }
  } catch {
    /* zniekształcony op — pomijamy */
  }
}

// Snapshot świata → do workera (Lab.getProp/getX/findComponent czytają go w Javie).
function buildWorldState(): string {
  const lab = labFacade;
  if (!lab) return "";
  const lines: string[] = [];
  const world = lab.worldInfo();
  for (const c of world) {
    lines.push(`comp|${c.id}|${c.objectId}|${c.lang}|${c.kind}`);
    const state = javaCompState.get(c.id);
    if (state) {
      for (const [k, v] of Object.entries(state).slice(0, JAVA_PROP_LIMIT)) {
        lines.push(`prop|${c.id}|${k}|${typeof v === "number" || typeof v === "string" ? v : JSON.stringify(v)}`);
      }
      continue;
    }
    const members = c.bridge.listMembers?.() ?? [];
    for (const m of members.slice(0, JAVA_PROP_LIMIT)) {
      if (m.kind !== "prop") continue;
      const v = lab.getProp(c.id, m.name);
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
        lines.push(`prop|${c.id}|${m.name}|${v}`);
      }
    }
  }
  const objIds = new Set<number>();
  for (const c of world) objIds.add(c.objectId);
  for (const id of javaTokens.values()) objIds.add(id);
  for (const o of currentHost?.world().describeScene() ?? []) {
    objIds.add(o.id);
    if (!world.some((c) => c.objectId === o.id)) lines.push(`obj|${o.id}|${o.name}`);
  }
  for (const o of objIds) {
    const p = lab.getPosition(o);
    if (p) lines.push(`pos|${o}|${p.x}|${p.y}`);
  }
  for (const [token, id] of javaTokens) {
    if (token < 0) lines.push(`spawned|${token}|${id}`);
  }
  return lines.join("\n");
}

function labService(op: string, p: Record<string, unknown>): string {
  const lab = labFacade;
  if (!lab) return "";
  const num = (v: unknown) => Number(v) || 0;
  try {
    switch (op) {
      case "spawn":
        return String(lab.spawn(String(p.name ?? "GameObject")));
      case "destroy":
        lab.destroyObject(num(p.objectId));
        return "ok";
      case "get": {
        const cid = num(p.compId);
        const prop = String(p.prop);
        const v = javaCompState.has(cid) ? javaCompState.get(cid)![prop] : lab.getProp(cid, prop);
        return v === undefined || v === null ? "" : JSON.stringify(v);
      }
      case "set": {
        const cid = num(p.compId);
        const v = coerce(p.value);
        if (javaCompState.has(cid)) javaCompState.get(cid)![String(p.prop)] = v;
        else lab.setProp(cid, String(p.prop), v);
        return "ok";
      }
      case "call": {
        const args = JSON.parse(String(p.argsJson || "[]"));
        const v = lab.call(num(p.compId), String(p.method), ...(Array.isArray(args) ? args : [args]));
        return v === undefined ? "" : JSON.stringify(v);
      }
      case "findComponent":
        return String(lab.findComponent(String(p.kind)) ?? 0);
      case "attachComponent": {
        const state: Record<string, unknown> = {};
        const cid = lab.attachBridge(num(p.objectId), String(p.kind), {
          get: (k) => state[k],
          set: (k, v) => {
            state[k] = v;
          },
          invoke: () => undefined,
          listMembers: () => Object.keys(state).map((k) => ({ name: k, kind: "prop" as const })),
        });
        javaCompState.set(cid, state);
        return String(cid);
      }
      case "attachRenderer":
        lab.attachRenderer(num(p.objectId), JSON.parse(String(p.specJson || "{}")));
        return "ok";
      case "setPosition":
        lab.setPosition(num(p.objectId), num(p.x), num(p.y));
        return "ok";
      case "getPosition":
        return JSON.stringify(lab.getPosition(num(p.objectId))) ?? "null";
      case "info":
        return JSON.stringify(lab.worldInfo());
      default:
        return "";
    }
  } catch (e) {
    return `ERR:${e instanceof Error ? e.message : String(e)}`;
  }
}

function onMessage({ data }: MessageEvent) {
  if (data?.command === "lab-call") {
    const res = labService(data.op, data.payload ?? {});
    if (labSab) {
      const i32 = new Int32Array(labSab);
      const u8 = new Uint8Array(labSab);
      const bytes = labEncoder.encode(res);
      const len = Math.min(bytes.length, u8.length - 8);
      u8.set(bytes.subarray(0, len), 8);
      Atomics.store(i32, 1, len);
      Atomics.store(i32, 0, 1);
      Atomics.notify(i32, 0);
    }
    return;
  }
  const run = pending;
  if (data?.gameId !== undefined && data.gameId !== run?.id) return;

  if (data?.command === "game-draw") {
    if (!run?.game) return;
    if (data.op === "frame") {
      frameCount += 1;
      const now = performance.now();
      if (now - lastFpsAt >= 1000) {
        currentHost?.onFps?.(Math.round((frameCount * 1000) / (now - lastFpsAt)));
        frameCount = 0;
        lastFpsAt = now;
      }
      const canvas = currentCanvas;
      const ctx = canvas?.getContext("2d");
      if (ctx) {
        ctx.save();
        try {
          for (const cmd of data.commands ?? []) drawCommand(ctx, cmd);
        } finally {
          ctx.restore();
        }
      }
      if (Number.isInteger(data.frameId)) {
        if (paused) {
          heldFrameId = data.frameId;
        } else {
          worker?.postMessage({ command: "game-frame-ack", gameId: data.gameId, frameId: data.frameId });
        }
      }
      // snapshot świata → worker (Lab.getProp/getX/findComponent w Javie)
      worker?.postMessage({
        command: "game-world",
        state: buildWorldState(),
        rev: data.frameId ?? frameCount,
        callResults: javaCallResults,
      });
      javaCallResults = "";
    } else {
      // pojedynczy op poza klatką (np. clear powitalny)
      const ctx = currentCanvas?.getContext("2d");
      if (ctx) drawCommand(ctx, data);
    }
    return;
  }
  if (data?.command === "game-output") {
    if (!run) return;
    const line = { level: data.level ?? "log", text: String(data.output ?? "") };
    if (!run.started) {
      run.startupOutput.push(line);
      return;
    }
    if (line.level === "error") currentHost?.stderr(line.text);
    else currentHost?.stdout(line.text);
    return;
  }
  if (data?.command === "game-error") {
    if (!run) return;
    currentHost?.stderr(String(data.error ?? "Błąd gry Java") + "\n");
    finish({ status: "runtime-error", message: String(data.error ?? "") });
    return;
  }
  if (data?.command === "game-stopped") {
    if (!run) return;
    finish({ status: "stopped" });
    return;
  }
  if (!run || !data?.id || data.id !== run.id) return;
  if (data.command === "phase") {
    currentHost?.stdout(String(data.phase) + "\n");
    return;
  }
  if (data.command === "result") {
    clearTimeout(run.timeoutId);
    if (!data.ok) {
      const detail = formatDiagnostics(data.diagnostics) || data.error || "Kompilacja nie powiodła się.";
      if (data.output) currentHost?.stderr(String(data.output) + "\n");
      currentHost?.stderr(String(detail) + "\n");
      finish({ status: "compile-error", message: String(data.phase ?? detail) });
      return;
    }
    if (!run.game) {
      if (data.output) currentHost?.stdout(String(data.output));
      finish({ status: "ok" });
      return;
    }
    // gra skompilowana — wypisuje startowe outputy i czeka na stop/error
    run.started = true;
    for (const line of run.startupOutput.splice(0)) {
      if (line.level === "error") currentHost?.stderr(line.text);
      else currentHost?.stdout(line.text);
    }
  }
}

let currentHost: LabHost | undefined;
let currentCanvas: HTMLCanvasElement | undefined;
let frameCount = 0;
let lastFpsAt = 0;

function finish(result: RunResult) {
  const run = pending;
  if (!run) return;
  pending = undefined;
  clearTimeout(run.timeoutId);
  detachInput?.();
  detachInput = undefined;
  heldFrameId = undefined;
  debugColliders = false;
  audioOut?.stop();
  if (currentHost) currentHost.onPaused = undefined;
  run.resolve(result);
}

export const javaRuntime: LabRuntime = {
  id: "java",
  label: "Java",
  extensions: ["java"],

  async load(onProgress) {
    onProgress("Inicjuję kompilator TeaVM…");
    await ensureWorker();
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    const javaFiles = Object.fromEntries(
      Object.entries(req.files).filter(([name]) => name.endsWith(".java")),
    );
    if (!Object.keys(javaFiles).length) {
      return { status: "compile-error", message: "Brak plików .java w projekcie." };
    }
    let prepared;
    try {
      prepared = prepareGameRequest(javaFiles, req.entry);
    } catch (err) {
      return { status: "compile-error", message: err instanceof Error ? err.message : String(err) };
    }
    await ensureWorker();
    if (prepared.mode === "game") {
      javaRenderer();
      await assetsLoaded?.catch(() => undefined);
    }

    const id = ++nextId;
    currentHost = host;
    currentCanvas = host.canvasEl;
    paused = false;
    debugColliders = false;
    lastView = { x: 0, y: 0 };

    const isGame = prepared.mode === "game";
    labFacade = createLabFacade(host, "java", { files: javaFiles });
    javaCompState.clear();
    if (!labSab && typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated) {
      labSab = new SharedArrayBuffer(8 + 8192);
    }
    if (labSab) {
      worker!.postMessage({ command: "lab-init", sab: labSab });
    } else {
      host.warn("SharedArrayBuffer niedostępny — synchroniczny interop Lab.* z Javy wyłączony.\n");
    }
    pending = {
      id,
      game: isGame,
      started: false,
      startupOutput: [],
      resolve: undefined as never,
      timeoutId: 0,
    };

    return new Promise<RunResult>((resolve) => {
      const run = pending!;
      run.resolve = resolve;
      run.timeoutId = window.setTimeout(() => {
        if (pending?.id === id && !pending.started) {
          pending = undefined;
          resetWorker();
          resolve({ status: "runtime-error", message: "Kompilacja TeaVM trwała zbyt długo." });
        }
      }, COMPILE_TIMEOUT_MS);

      if (isGame) {
        attachInput(host.canvasEl!, id);
        host.onPaused = (p) => {
          paused = p;
          if (!p && heldFrameId !== undefined) {
            worker?.postMessage({ command: "game-frame-ack", gameId: id, frameId: heldFrameId });
            heldFrameId = undefined;
          }
        };
      }

      worker!.postMessage({
        command: "compile-and-run",
        id,
        files: prepared.files,
        mainClass: prepared.mainClass,
        mode: prepared.mode,
        frameAcknowledgements: isGame,
      });
      if (isGame) worker!.postMessage({ command: "game-resize", width: GAME_W, height: GAME_H });
    });
  },

  stop() {
    if (!pending) return;
    if (pending.game) {
      worker?.postMessage({ command: "game-stop" });
      const id = pending.id;
      // game-stopped dokończy finish(); fallback gdyby worker milczał:
      window.setTimeout(() => {
        if (pending?.id === id) finish({ status: "stopped" });
      }, 3000);
    } else {
      finish({ status: "stopped" });
    }
  },
};
