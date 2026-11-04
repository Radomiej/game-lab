import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade } from "../core/host";
import type { ComponentBridge } from "../core/world";
import { getActiveEngine, getActiveGame, labEngineDisposed } from "../engine/index";

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

type PyGlobals = { get(k: string): PyCallable | undefined };

/** Świeże globals z modułem `lab` (SimpleNamespace) dla run() i evalFile().
 *  Fasada związana z przekazanym hostem — eval z gry JS dostaje jej stdout/world. */
async function makeGlobals(host: LabHost, files: Record<string, string>): Promise<PyGlobals> {
  const py = pyodide!;
  const lab = createLabFacade(host, "python", { files });
  py.setStdout({ batched: (line) => host.stdout(line + "\n") });
  py.setStderr({ batched: (line) => host.stderr(line + "\n") });
  try {
    py.setStdin({ stdin: () => host.readStdinLine() });
  } catch {
    // starsze wydania Pyodide — input() otworzy prompt() przeglądarki
  }

  // Pomocnic do inspektora: publiczne składowe obiektu [nazwa, isCallable].
  const membersFn = (await py.runPythonAsync(
    "lambda o: [[n, callable(getattr(o, n))] for n in dir(o) if not n.startswith('_')]",
  )) as PyCallable;
  // Spec/dict przekazane z Pythona to PyProxy — dostęp .pole nie sięga kluczy
  // słownika (getattr-miss → undefined). Konwertujemy je na zwykłe obiekty JS.
  // impl komponentu zostaje proxy — most trzyma żywy obiekt Pythona.
  const toJsArg = (value: unknown): unknown => {
    const proxy = value as { toJs?: () => unknown; destroy?: () => void } | null;
    if (!proxy || typeof proxy !== "object" || typeof proxy.toJs !== "function") return value;
    try { return proxy.toJs(); } finally { proxy.destroy?.(); }
  };
  const labForPy = {
    ...Object.fromEntries(
      Object.entries(lab).map(([k, v]) => [
        k,
        typeof v === "function"
          ? (...args: unknown[]) => (v as (...a: unknown[]) => unknown)(...args.map(toJsArg))
          : v,
      ]),
    ),
    attachComponent(objectId: number, kind: string, impl: Record<string, unknown>): number {
      // Arguments crossing from Python into this JS callback are borrowed
      // proxies. Keep an owned copy because the component outlives runPythonAsync.
      const ownedImpl = (impl as unknown as { copy?: () => Record<string, unknown> }).copy?.() ?? impl;
      const fromPython = (value: unknown): unknown => {
        const proxy = value as { toJs?: () => unknown; destroy?: () => void } | null;
        if (!proxy || typeof proxy !== "object" || typeof proxy.toJs !== "function") return value;
        try { return proxy.toJs(); } finally { proxy.destroy?.(); }
      };
      // getattr na już zniszczonym proxy (dispose przed onDestroy silnika)
      // rzuca "Object has already been destroyed" — traktujemy jak brak składowej.
      const member = (m: string): unknown => {
        try {
          return ownedImpl[m as keyof typeof ownedImpl];
        } catch {
          return undefined;
        }
      };
      const bridge: ComponentBridge = {
        get: (k) => fromPython(member(k)),
        set: (k, v) => {
          try {
            ownedImpl[k] = v;
          } catch {
            /* martwy proxy — komponent już nie żyje */
          }
        },
        invoke: (m, args) => {
          try {
            const fn = member(m);
            // getattr-miss na PyProxy spada na PyProxy.prototype (destroy, copy,
            // toJs…) — to metody JS, nie Pythona. Wołane odłączone od this
            // wywalają "reading 'Symbol(pyproxy.attrs)'"; pomijamy je, ale
            // prawdziwa metoda Pythona o tej nazwie (np. def destroy) przechodzi.
            if (
              typeof fn !== "function" ||
              fn === (Object.getPrototypeOf(ownedImpl) as Record<string, unknown> | null)?.[m]
            )
              return undefined;
            return fromPython((fn as (...a: unknown[]) => unknown)(...args));
          } catch (err) {
            throw new Error(`invoke(${m}): ${err instanceof Error ? err.message : err}\n${err instanceof Error ? err.stack : ""}`);
          }
        },
        listMembers: () => {
          try {
            const members = membersFn(ownedImpl) as { toJs(): [string, boolean][]; destroy?: () => void };
            try {
              return (members.toJs() ?? []).map(([name, isFn]) => ({
                name,
                kind: isFn ? ("method" as const) : ("prop" as const),
              }));
            } finally {
              members.destroy?.();
            }
          } catch {
            return [];
          }
        },
        dispose: () => {
          (ownedImpl as unknown as { destroy?: () => void }).destroy?.();
        },
      };
      return lab.attachBridge(objectId, kind, bridge);
    },
  };

  const globals = py.toPy({ lab: py.toPy(labForPy) }) as PyGlobals;
  // Pyodide converts a plain JS object into a Python dict. Expose the
  // facade as an attribute API, matching the other language runtimes.
  await py.runPythonAsync(
    "from types import SimpleNamespace\nlab = SimpleNamespace(**lab)",
    { globals },
  );
  return globals;
}

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

    const globals = await makeGlobals(host, req.files);
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
      // Kod mógł zmaterializować scenę w silniku — trzymamy run() do Stop.
      const game = getActiveGame();
      if (game) {
        host.onPaused = (p) => (p ? game.pause() : game.resume());
        try {
          await host.startGameLoop(() => {});
        } finally {
          host.onPaused = undefined;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.stderr(msg + "\n");
      return { status: "runtime-error", message: msg };
    } finally {
      getActiveEngine()?.dispose();
      labEngineDisposed();
    }

    return { status: "ok" };
  },

  /** lab.evalFile("x.py") — wykonuje plik w tym samym interpreterze
   *  na cudzym hoście; zarejestrowane komponenty żyją w rejestrze. */
  async evalFile(name: string, source: string, host: LabHost): Promise<void> {
    if (!pyodide) throw new Error("python: runtime nie załadowany");
    const globals = await makeGlobals(host, {});
    try {
      await pyodide.runPythonAsync(source, { globals });
    } catch (err) {
      throw new Error(`python:${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  stop() {
    // pętlę zatrzymuje host.requestStop() z UI
  },
};
