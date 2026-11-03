import { loadPHPRuntime, PHP, withPHPIniValues } from "@php-wasm/universal";
import { getPHPLoaderModule } from "@php-wasm/web-8-4";
import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade } from "../core/host";
import { getActiveGame, getActiveEngine, labEngineDisposed } from "../engine/index";

// PHP 8.4 przez @php-wasm (port src/services/phpRuntime.js z web-learning-lab).
// Instancja trwała — MEMFS przeżywa między runami (plik odpowiedzi lab-call).
// Interop: post_message_to_js() w PHP -> onMessage -> host applikuje op
// i zapisuje wynik do /labc/response.json, który PHP odczytuje natychmiast
// (wywołanie JS z WASM jest inline -> quasi-synchroniczne w trakcie skryptu).
const PROJECT_ROOT = "/labc";
const RESPONSE_PATH = `${PROJECT_ROOT}/response.json`;
const RUN_TIMEOUT = 15000;

let phpInstance: PHP | null = null;
let runtimePromise: Promise<PHP> | null = null;
let runSequence = 0;
let stepSequence = 0;
let executionQueue: Promise<unknown> = Promise.resolve();
let detachMessage: (() => Promise<void>) | null = null;

function enqueuePhp<T>(job: () => Promise<T>): Promise<T> {
  const result = executionQueue.then(job);
  executionQueue = result.then(() => undefined, () => undefined);
  return result;
}

function safeProjectPath(path: string): string {
  const value = String(path || "").replaceAll("\\", "/");
  if (!value || value.startsWith("/") || value.includes("\0")) {
    throw new Error(`Nieprawidłowa ścieżka pliku PHP: ${path}`);
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Nieprawidłowa ścieżka pliku PHP: ${path}`);
  }
  return parts.join("/");
}

function describeError(error: unknown): string {
  if (!error) return "Nieznany błąd PHP.";
  if (typeof error === "string") return error;
  return String((error as Error).message || error);
}

// Lab.php doklejane do projektu — fasada wspólnej sceny z poziomu PHP.
const LAB_PHP = `<?php
class Lab {
    private static function call(string $op, array $args = []) {
        post_message_to_js(json_encode(['op' => $op, 'args' => $args]));
        $resp = @file_get_contents('${RESPONSE_PATH}');
        @unlink('${RESPONSE_PATH}');
        if ($resp === false) return null;
        $data = json_decode($resp, true);
        return $data['result'] ?? null;
    }
    public static function spawn(string $name = '') {
        return self::call('spawn', ['name' => $name]);
    }
    public static function destroyObject(int $obj) {
        self::call('destroy', ['object' => $obj]);
    }
    public static function setPosition(int $obj, float $x, float $y) {
        self::call('setPosition', ['object' => $obj, 'x' => $x, 'y' => $y]);
    }
    public static function attachRenderer(int $obj, array $spec) {
        self::call('attachRenderer', ['object' => $obj, 'spec' => $spec]);
    }
    public static function setProp(int $comp, string $prop, $value) {
        self::call('setProp', ['comp' => $comp, 'prop' => $prop, 'value' => $value]);
    }
    public static function getProp(int $comp, string $prop) {
        return self::call('getProp', ['comp' => $comp, 'prop' => $prop]);
    }
    public static function findComponent(string $kind) {
        return self::call('findComponent', ['kind' => $kind]);
    }
    public static function callMethod(int $comp, string $method, array $args = []) {
        return self::call('call', ['comp' => $comp, 'method' => $method, 'args' => $args]);
    }
    public static function attachStateComponent(int $object, string $kind, string $handlerFile, array $state = []) {
        return self::call('attachStateComponent', ['object' => $object, 'kind' => $kind, 'handlerFile' => $handlerFile, 'state' => $state]);
    }
    public static function worldInfo() {
        return self::call('info', []);
    }
}
`;

type LabOp = { op?: string; args?: Record<string, unknown> };

type PhpStepContext = {
  php: PHP;
  host: LabHost;
  lab: ReturnType<typeof createLabFacade>;
  runRoot: string;
  files: Record<string, string>;
};

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function withPhpLabListener<T>(php: PHP, lab: PhpStepContext["lab"], context: PhpStepContext, job: () => Promise<T>): Promise<T> {
  if (detachMessage) {
    try { await detachMessage(); } catch { /* noop */ }
    detachMessage = null;
  }
  const detach = php.onMessage((data: unknown) => applyLabMessage(String(data), lab, php, context));
  detachMessage = detach;
  try {
    return await job();
  } finally {
    try { await detach(); } catch { /* noop */ }
    if (detachMessage === detach) detachMessage = null;
  }
}

async function runPhpComponentStep(
  context: PhpStepContext,
  handlerFile: string,
  method: string,
  args: unknown[],
  state: Record<string, unknown>,
): Promise<{ state: Record<string, unknown>; result: unknown }> {
  const php = context.php;
  const requestId = ++stepSequence;
  const resultMarker = `__LAB_STATE_STEP_${requestId}__`;
  const handlerPath = `${context.runRoot}/${safeProjectPath(handlerFile)}`;
  const payload = toBase64Utf8(JSON.stringify({ state, method, args, handlerPath }));
  const scriptPath = `${context.runRoot}/.lab-step-${requestId}.php`;
  const phpSource = `<?php
$input = json_decode(base64_decode('${payload}'), true, 512, JSON_THROW_ON_ERROR);
require $input['handlerPath'];
if (!function_exists('lab_component_dispatch')) { throw new RuntimeException('handler must define lab_component_dispatch($state, $method, $args)'); }
$output = lab_component_dispatch($input['state'], $input['method'], $input['args']);
if (!is_array($output) || !array_key_exists('state', $output) || !array_key_exists('result', $output)) { throw new RuntimeException('handler must return ["state" => ..., "result" => ...]'); }
echo "\\n${resultMarker}" . base64_encode(json_encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) . "\\n";
`;
  php.writeFile(scriptPath, phpSource);
  const response = await withPhpLabListener(php, context.lab, context, () =>
    withTimeout(withPHPIniValues(php, { auto_prepend_file: `${context.runRoot}/Lab.php` }, () => php.run({ scriptPath }))),
  );
  const stdout = String(response.text ?? "");
  const errors = String(response.errors ?? "");
  if (errors) context.host.stderr(errors);
  if (Number(response.exitCode ?? 0) !== 0) {
    throw new Error(errors.trim() || `PHP state handler exited with code ${response.exitCode}`);
  }
  const markerAt = stdout.lastIndexOf(resultMarker);
  if (markerAt < 0) throw new Error("PHP state handler did not return its state/result envelope");
  const encoded = stdout.slice(markerAt + resultMarker.length).trim().split(/\s/, 1)[0];
  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))); }
  catch (error) { throw new Error(`Invalid PHP state handler response: ${describeError(error)}`); }
  const envelope = decoded as { state?: unknown; result?: unknown } | null;
  if (!envelope || typeof envelope.state !== "object" || envelope.state === null || Array.isArray(envelope.state) || !Object.hasOwn(envelope, "result")) {
    throw new Error("PHP state handler returned an invalid state/result envelope");
  }
  return { state: envelope.state as Record<string, unknown>, result: envelope.result };
}

function attachStateComponent(
  context: PhpStepContext,
  objectId: number,
  kind: string,
  handlerFile: string,
  initialState: unknown,
): number {
  const path = safeProjectPath(handlerFile);
  if (!path.endsWith(".php") || typeof context.files[path] !== "string") {
    throw new Error(`PHP state handler file not found: ${path}`);
  }
  if (!initialState || typeof initialState !== "object" || Array.isArray(initialState)) {
    throw new Error("PHP state component state must be a JSON object");
  }
  let state = JSON.parse(JSON.stringify(initialState)) as Record<string, unknown>;
  let disposed = false;
  const componentId = context.lab.attachBridge(objectId, kind, {
    get: (name) => state[name],
    set: (name, value) => { state[name] = value; },
    invoke: () => undefined,
    invokeAsync: async (method, args) => {
      if (disposed) throw new Error(`PHP state component ${kind} was disposed`);
      const output = await enqueuePhp(() => runPhpComponentStep(context, path, method, args, state));
      if (!disposed) state = output.state;
      return output.result;
    },
    dispose: () => { disposed = true; },
    listMembers: () => Object.keys(state).map((name) => ({ name, kind: "prop" as const })),
  });
  return componentId;
}

function applyLabMessage(raw: string, lab: ReturnType<typeof createLabFacade>, php: PHP, context: PhpStepContext): void {
  let msg: LabOp;
  try {
    msg = JSON.parse(raw) as LabOp;
  } catch {
    lab.print(`[php->lab] ${raw}`);
    return;
  }
  const args = (msg.args ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => Number(v ?? 0);
  let result: unknown = null;
  try {
    switch (msg.op) {
      case "spawn":
        result = lab.spawn(String(args.name ?? "") || undefined);
        break;
      case "destroy":
        lab.destroyObject(num(args.object));
        break;
      case "setPosition":
        lab.setPosition(num(args.object), num(args.x), num(args.y));
        break;
      case "attachRenderer":
        lab.attachRenderer(num(args.object), (args.spec ?? {}) as Record<string, unknown>);
        break;
      case "setProp":
        lab.setProp(num(args.comp), String(args.prop ?? ""), args.value);
        break;
      case "getProp":
        result = lab.getProp(num(args.comp), String(args.prop ?? ""));
        break;
      case "findComponent":
        result = lab.findComponent(String(args.kind ?? ""));
        break;
      case "call":
        result = lab.call(num(args.comp), String(args.method ?? ""), ...(Array.isArray(args.args) ? (args.args as unknown[]) : []));
        break;
      case "attachStateComponent":
        result = attachStateComponent(context, num(args.object), String(args.kind ?? ""), String(args.handlerFile ?? ""), args.state);
        break;
      case "info":
        result = lab.worldInfo();
        break;
      default:
        lab.print(`[php->lab] nieznana operacja: ${String(msg.op)}`);
    }
  } catch (err) {
    result = { error: describeError(err) };
  }
  try {
    php.writeFile(RESPONSE_PATH, JSON.stringify({ result }));
  } catch {
    // brak FS (np. runtime w trakcie resetu) — op bez odpowiedzi
  }
}

async function getPhp(): Promise<PHP> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const loaderModule = await getPHPLoaderModule();
      const runtimeId = await loadPHPRuntime(loaderModule);
      const php = new PHP(runtimeId);
      php.mkdirTree(PROJECT_ROOT);
      phpInstance = php;
      return php;
    })().catch((error) => {
      runtimePromise = null;
      phpInstance = null;
      throw error;
    });
  }
  return runtimePromise;
}

async function withTimeout<T>(promise: Promise<T>, timeout = RUN_TIMEOUT): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("PHP przekroczył limit czasu wykonania.")), timeout);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

function writeProjectFiles(php: PHP, files: Record<string, string>, runRoot: string): void {
  php.mkdirTree(runRoot);
  php.writeFile(`${runRoot}/Lab.php`, LAB_PHP);
  for (const [path, contents] of Object.entries(files)) {
    const relativePath = safeProjectPath(path);
    if (!relativePath.endsWith(".php")) continue;
    const absolutePath = `${runRoot}/${relativePath}`;
    const dir = absolutePath.slice(0, absolutePath.lastIndexOf("/"));
    if (dir) php.mkdirTree(dir);
    php.writeFile(absolutePath, contents);
  }
}

export const phpRuntime: LabRuntime = {
  id: "php",
  label: "PHP",
  extensions: ["php"],

  async load(onProgress: (msg: string) => void): Promise<void> {
    if (phpInstance) return;
    onProgress("ładowanie PHP 8.4 (php-wasm)…");
    await getPhp();
    onProgress("PHP gotowy");
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    const entry = safeProjectPath(req.entry);
    if (!req.files[entry]) return { status: "compile-error", message: `brak pliku ${entry}` };

    const lab = createLabFacade(host, "php", { files: req.files });
    const runResult = await enqueuePhp(async (): Promise<{ result: RunResult; game: ReturnType<typeof getActiveGame> }> => {
      const php = await getPhp();
      const runRoot = `${PROJECT_ROOT}/run-${++runSequence}`;
      writeProjectFiles(php, req.files, runRoot);
      const context: PhpStepContext = { php, host, lab, runRoot, files: req.files };

      try {
        // Lab.php laduje sie przed kazdym skryptem (auto_prepend_file).
        const response = await withPhpLabListener(php, lab, context, () =>
          withTimeout(withPHPIniValues(php, { auto_prepend_file: `${runRoot}/Lab.php` }, () => php.run({ scriptPath: `${runRoot}/${entry}` }))),
        );
        const stdout = String(response.text ?? "");
        const errors = String(response.errors ?? "");
        if (stdout) host.stdout(stdout);
        if (errors) host.stderr(errors);
        const exitCode = Number(response.exitCode ?? 0);
        return {
          result: exitCode === 0 ? { status: "ok" } : { status: "runtime-error", message: `exit code ${exitCode}` },
          game: getActiveGame(),
        };
      } catch (err) {
        const msg = describeError(err);
        if (/limit czasu|przekroczył|semaphore/i.test(msg)) {
          try { phpInstance?.[Symbol.dispose]?.(); } catch { /* noop */ }
          phpInstance = null;
          runtimePromise = null;
        }
        host.stderr(msg + "\n");
        return { result: { status: "runtime-error", message: msg }, game: null };
      }
    });
    let result = runResult.result;
    if (result.status === "ok" && runResult.game) {
      const game = runResult.game;
      host.onPaused = (p) => (p ? game.pause() : game.resume());
      try {
        // Keep the PHP request queue free while the host owns the game loop;
        // async state-component calls can now enqueue another PHP request.
        await host.startGameLoop(() => {});
      } finally {
        host.onPaused = undefined;
      }
    }
    getActiveEngine()?.dispose();
    labEngineDisposed();
    return result;
  },

  stop() {
    // PHP run nie da się przerwać w locie — timeout resetuje instancję.
  },
};
