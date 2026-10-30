import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade } from "../core/host";
import { getActiveGame, getActiveEngine, labEngineDisposed } from "../engine/index";

// C++ — wariant lekki: JSCPP, interpreter podzbioru C++ w JS (~200 KB).
// Wystarcza na lekcje konsolowe (iostream, zmienne, pętle, funkcje,
// wskaźniki podstawowo). Bez szablonów i pełnego STL.
//
// Interop: JSCPP działa na wątku głównym — natywne funkcje rejestrowane
// przez rt.regFunc wołają lab.* SYNCHRONICZNIE (jak JS/Lua/Python).
// Header <lab.h> (patrz labInclude niżej) wystawia lab_spawn, lab_getProp…
//
// Limitacja: komponentu z kodu C++ nie da się zarejestrować (interpreter
// jest jednorazowy — po main() nie ma do czego wracać). C++ może więc
// spawnować/czytać/pisać/wołać, ale nie dostarczać żywych komponentów.
//
// Ścieżka docelowa (patrz README): prawdziwy clang skompilowany do WASM
// (browsercc / llvm-wasi / debugger-sh) — wtedy silnik gry dostaje się
// przez extern "C" importy mapowane na host.draw().
//
// JSCPP jest CJS — ładujemy leniwie przez import().

type JSCppConfig = {
  stdio: { write: (s: string) => void; drain: () => string | null };
  unsigned_overflow?: "warn" | "error";
  debug?: boolean;
};

type JSCppRuntime = {
  intTypeLiteral: unknown;
  doubleTypeLiteral: unknown;
  charTypeLiteral: unknown;
  voidTypeLiteral: unknown;
  boolTypeLiteral?: unknown;
  normalPointerType(t: unknown): unknown;
  val(t: unknown, v: unknown): unknown;
  raiseException(msg: string): never;
  getStringFromCharArray(v: unknown): string;
  makeCharArrayFromString(s: string): unknown;
  regFunc(f: unknown, scope: string, name: string, args: unknown[], ret: unknown): void;
};

type JSCpp = {
  run(code: string, input: string, config: JSCppConfig): number;
  includes: Record<string, { load(rt: JSCppRuntime): void }>;
};

type LabFacade = ReturnType<typeof createLabFacade>;

let jscpp: JSCpp | null = null;
let activeLab: LabFacade | null = null;

const strArg = (rt: JSCppRuntime, v: unknown): string => rt.getStringFromCharArray(v);
const numArg = (v: unknown): number => Number((v as { v: number }).v ?? 0);

function labIncludeLoad(rt: JSCppRuntime): void {
  const tInt = rt.intTypeLiteral;
  const tDbl = rt.doubleTypeLiteral;
  const tChar = rt.charTypeLiteral;
  const tVoid = rt.voidTypeLiteral;
  const tCharPtr = rt.normalPointerType(tChar);
  const g = "global";
  const need = (): LabFacade => {
    if (!activeLab) rt.raiseException("lab.h: brak aktywnej fasady lab");
    return activeLab;
  };

  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, name: unknown) => {
      const id = need().spawn(strArg(rt2, name) || undefined);
      return rt2.val(tInt, id);
    },
    g, "lab_spawn", [tCharPtr], tInt,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, obj: unknown) => {
      need().destroyObject(numArg(obj));
      return rt2.val(tVoid, 0);
    },
    g, "lab_destroyObject", [tInt], tVoid,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, obj: unknown, x: unknown, y: unknown) => {
      need().setPosition(numArg(obj), numArg(x), numArg(y));
      return rt2.val(tVoid, 0);
    },
    g, "lab_setPosition", [tInt, tDbl, tDbl], tVoid,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, obj: unknown, tex: unknown, w: unknown, h: unknown) => {
      need().attachRenderer(numArg(obj), { type: "sprite", texture: strArg(rt2, tex), width: numArg(w), height: numArg(h) });
      return rt2.val(tVoid, 0);
    },
    g, "lab_attachRenderer", [tInt, tCharPtr, tDbl, tDbl], tVoid,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, kind: unknown) => {
      const id = need().findComponent(strArg(rt2, kind));
      return rt2.val(tInt, id ?? 0);
    },
    g, "lab_findComponent", [tCharPtr], tInt,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, obj: unknown, kind: unknown) => {
      const id = need().getComponent(numArg(obj), strArg(rt2, kind));
      return rt2.val(tInt, id ?? 0);
    },
    g, "lab_getComponent", [tInt, tCharPtr], tInt,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, comp: unknown, prop: unknown, v: unknown) => {
      need().setProp(numArg(comp), strArg(rt2, prop), numArg(v));
      return rt2.val(tVoid, 0);
    },
    g, "lab_setNum", [tInt, tCharPtr, tDbl], tVoid,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, comp: unknown, prop: unknown, v: unknown) => {
      need().setProp(numArg(comp), strArg(rt2, prop), strArg(rt2, v));
      return rt2.val(tVoid, 0);
    },
    g, "lab_setStr", [tInt, tCharPtr, tCharPtr], tVoid,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, comp: unknown, prop: unknown) => {
      const val = need().getProp(numArg(comp), strArg(rt2, prop));
      return rt2.val(tDbl, typeof val === "number" ? val : Number(val) || 0);
    },
    g, "lab_getNum", [tInt, tCharPtr], tDbl,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, comp: unknown, prop: unknown) => {
      const val = need().getProp(numArg(comp), strArg(rt2, prop));
      return rt2.makeCharArrayFromString(val == null ? "" : String(val));
    },
    g, "lab_getStr", [tInt, tCharPtr], tCharPtr,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, comp: unknown, method: unknown, argsJson: unknown) => {
      let parsed: unknown[] = [];
      try {
        const raw = strArg(rt2, argsJson);
        if (raw.trim()) parsed = JSON.parse(raw) as unknown[];
      } catch { /* pusta lista argów */ }
      const res = need().call(numArg(comp), strArg(rt2, method), ...parsed);
      return rt2.val(tDbl, typeof res === "number" ? res : Number(res) || 0);
    },
    g, "lab_call", [tInt, tCharPtr, tCharPtr], tDbl,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, msg: unknown) => {
      need().print(strArg(rt2, msg));
      return rt2.val(tVoid, 0);
    },
    g, "lab_print", [tCharPtr], tVoid,
  );
  rt.regFunc(
    (rt2: JSCppRuntime, _this: unknown, x: unknown, y: unknown, w: unknown, h: unknown, color: unknown) => {
      need().drawRect(numArg(x), numArg(y), numArg(w), numArg(h), strArg(rt2, color) || "#ffffff");
      return rt2.val(tVoid, 0);
    },
    g, "lab_drawRect", [tDbl, tDbl, tDbl, tDbl, tCharPtr], tVoid,
  );
}

export const cppRuntime: LabRuntime = {
  id: "cpp",
  label: "C++",
  extensions: ["cpp", "cc", "cxx", "h", "hpp"],

  async load(onProgress: (msg: string) => void): Promise<void> {
    if (jscpp) return;
    onProgress("ładowanie interpretera C++…");
    const mod = (await import("JSCPP")) as { default?: JSCpp } | JSCpp;
    jscpp = ("default" in mod ? mod.default : mod) as JSCpp;
    jscpp.includes["lab"] = { load: labIncludeLoad };
    jscpp.includes["lab.h"] = jscpp.includes["lab"];
    onProgress("C++ gotowy (JSCPP — podzbiór edukacyjny + lab.h)");
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    if (!jscpp) return { status: "runtime-error", message: "runtime nie załadowany" };
    const source = req.files[req.entry];
    if (source == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };

    activeLab = createLabFacade(host, "cpp", { files: req.files });
    try {
      const code = jscpp.run(source, req.stdin ?? "", {
        stdio: {
          write: (s) => host.stdout(s),
          drain: () => host.readStdinLine(),
        },
        unsigned_overflow: "error",
      });

      // Skrypt mógł zmaterializować scenę (attachRenderer/spawn) — trzymaj do Stop.
      const game = getActiveGame();
      if (game) {
        host.onPaused = (p) => (p ? game.pause() : game.resume());
        try {
          await host.startGameLoop(() => {});
        } finally {
          host.onPaused = undefined;
        }
      }
      return { status: "ok", message: `exit code ${code}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.stderr(msg + "\n");
      const isSyntax = /line \d+|syntax|unexpected/i.test(msg);
      return { status: isSyntax ? "compile-error" : "runtime-error", message: msg };
    } finally {
      activeLab = null;
      getActiveEngine()?.dispose();
      labEngineDisposed();
    }
  },

  stop() {
    // interpreter synchroniczny — stop jest niezauważalny w main-thread (limitacja POC)
  },
};
