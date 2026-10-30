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
let executionQueue: Promise<unknown> = Promise.resolve();
let detachMessage: (() => Promise<void>) | null = null;

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
    public static function worldInfo() {
        return self::call('info', []);
    }
}
`;

type LabOp = { op?: string; args?: Record<string, unknown> };

function applyLabMessage(raw: string, lab: ReturnType<typeof createLabFacade>, php: PHP): void {
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
    const job = executionQueue.then(async (): Promise<RunResult> => {
      const php = await getPhp();
      const runRoot = `${PROJECT_ROOT}/run-${++runSequence}`;
      writeProjectFiles(php, req.files, runRoot);

      // jedna instancja onMessage — odpinamy poprzednią, by nie dublować
      if (detachMessage) {
        try { await detachMessage(); } catch { /* noop */ }
        detachMessage = null;
      }
      detachMessage = php.onMessage((data: unknown) => {
        applyLabMessage(String(data), lab, php);
      });

      try {
        // Lab.php laduje sie przed kazdym skryptem (auto_prepend_file).
        const response = await withTimeout(
          withPHPIniValues(php, { auto_prepend_file: `${runRoot}/Lab.php` }, () =>
            php.run({ scriptPath: `${runRoot}/${entry}` }),
          ),
        );
        const stdout = String(response.text ?? "");
        const errors = String(response.errors ?? "");
        if (stdout) host.stdout(stdout);
        if (errors) host.stderr(errors);
        const exitCode = Number(response.exitCode ?? 0);

        // Skrypt mógł zmaterializować scenę (attachRenderer/spawn) —
        // trzymamy run() do Stop, jak Lua/Python.
        const game = getActiveGame();
        if (game) {
          host.onPaused = (p) => (p ? game.pause() : game.resume());
          try {
            await host.startGameLoop(() => {});
          } finally {
            host.onPaused = undefined;
          }
        }
        return exitCode === 0 ? { status: "ok" } : { status: "runtime-error", message: `exit code ${exitCode}` };
      } catch (err) {
        const msg = describeError(err);
        if (/limit czasu|przekroczył|semaphore/i.test(msg)) {
          try { phpInstance?.[Symbol.dispose]?.(); } catch { /* noop */ }
          phpInstance = null;
          runtimePromise = null;
        }
        host.stderr(msg + "\n");
        return { status: "runtime-error", message: msg };
      }
    });
    executionQueue = job.then(() => undefined, () => undefined);
    const result = await job;
    getActiveEngine()?.dispose();
    labEngineDisposed();
    return result;
  },

  stop() {
    // PHP run nie da się przerwać w locie — timeout resetuje instancję.
  },
};
