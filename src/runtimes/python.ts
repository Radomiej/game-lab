import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade } from "../core/host";
import type { ComponentBridge } from "../core/world";

// Pyodide = prawdziwy CPython skompilowany do WASM. Ładowany leniwie,
// dopiero przy pierwszym uruchomieniu Pythona (~10–30 MB z CDN; do
// wdrożenia szkolnego warto zvendorować jak public/vendor/teavm).
const PYODIDE_VERSION = "v0.26.4";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.mjs`;

type PyCallable = (...a: unknown[]) => unknown;

type Pyodide = {
  runPythonAsync(code: string, opts?: { globals?: unknown }): Promise<unknown>;
  toPy(value: unknown): unknown;
  setStdout(options: { batched: (line: string) => void }): void;
  setStderr(options: { batched: (line: string) => void }): void;
  setStdin(options: { stdin: () => string | null }): void;
};

let pyodide: Pyodide | null = null;

export const pythonRuntime: LabRuntime = {
  id: "python",
  label: "Python",
  extensions: ["py"],

  async load(onProgress: (msg: string) => void): Promise<void> {
    if (pyodide) return;
    onProgress("pobieranie Pyodide (CPython/WASM)…");
    const mod = (await import(/* @vite-ignore */ PYODIDE_URL)) as {
      loadPyodide: (opts?: Record<string, unknown>) => Promise<Pyodide>;
    };
    onProgress("start interpretera…");
    pyodide = await mod.loadPyodide();
    onProgress("Python gotowy");
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    if (!pyodide) return { status: "runtime-error", message: "runtime nie załadowany" };
    const source = req.files[req.entry];
    if (source == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };

    const lab = createLabFacade(host, "python");
    pyodide.setStdout({ batched: (line) => host.stdout(line + "\n") });
    pyodide.setStderr({ batched: (line) => host.stderr(line + "\n") });
    try {
      pyodide.setStdin({ stdin: () => host.readStdinLine() });
    } catch {
      // starsze wydania Pyodide — input() otworzy prompt() przeglądarki
    }

    // Pomocnic do inspektora: publiczne składowe obiektu [nazwa, isCallable].
    const membersFn = (await pyodide.runPythonAsync(
      "lambda o: [[n, callable(getattr(o, n))] for n in dir(o) if not n.startswith('_')]",
    )) as PyCallable;
    const labForPy = {
      ...lab,
      attachComponent(objectId: number, kind: string, impl: Record<string, unknown>): number {
        const bridge: ComponentBridge = {
          get: (k) => impl[k],
          set: (k, v) => {
            impl[k] = v;
          },
          invoke: (m, args) => {
            const fn = impl[m];
            return typeof fn === "function" ? (fn as (...a: unknown[]) => unknown)(...args) : undefined;
          },
          listMembers: () =>
            ((membersFn(impl) as { toJs(): [string, boolean][] }).toJs() ?? []).map(([name, isFn]) => ({
              name,
              kind: isFn ? ("method" as const) : ("prop" as const),
            })),
        };
        return lab.attachBridge(objectId, kind, bridge);
      },
    };

    // świeży globals na każdy run + wystawiony moduł "lab"
    const globals = pyodide.toPy({ lab: pyodide.toPy(labForPy) }) as {
      get(k: string): PyCallable | undefined;
    };

    try {
      await pyodide.runPythonAsync(source, { globals });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isSyntax = /SyntaxError|IndentationError|TabError/.test(msg);
      host.stderr(msg + "\n");
      return { status: isSyntax ? "compile-error" : "runtime-error", message: msg };
    }

    // init()/update(dt) po stronie ucznia
    const updateFn = globals.get("update");
    const initFn = globals.get("init");

    try {
      if (updateFn) {
        await host.startGameLoop(
          (dt) => {
            updateFn(dt);
          },
          initFn ? () => { initFn(); } : undefined,
        );
      } else if (initFn) {
        initFn();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.stderr(msg + "\n");
      return { status: "runtime-error", message: msg };
    }

    return { status: "ok" };
  },

  stop() {
    // pętlę zatrzymuje host.requestStop() z UI
  },
};
