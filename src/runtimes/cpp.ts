import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";

// C++ — wariant lekki: JSCPP, interpreter podzbioru C++ w JS (~200 KB).
// Wystarcza na lekcje konsolowe (iostream, zmienne, pętle, funkcje,
// wskaźniki podstawowo). Bez szablonów i pełnego STL.
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

type JSCpp = { run(code: string, input: string, config: JSCppConfig): number };

let jscpp: JSCpp | null = null;

export const cppRuntime: LabRuntime = {
  id: "cpp",
  label: "C++",
  extensions: ["cpp", "cc", "cxx", "h", "hpp"],

  async load(onProgress: (msg: string) => void): Promise<void> {
    if (jscpp) return;
    onProgress("ładowanie interpretera C++…");
    const mod = (await import("JSCPP")) as { default?: JSCpp } | JSCpp;
    jscpp = ("default" in mod ? mod.default : mod) as JSCpp;
    onProgress("C++ gotowy (JSCPP — podzbiór edukacyjny)");
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    if (!jscpp) return { status: "runtime-error", message: "runtime nie załadowany" };
    const source = req.files[req.entry];
    if (source == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };

    try {
      const code = jscpp.run(source, req.stdin ?? "", {
        stdio: {
          write: (s) => host.stdout(s),
          drain: () => host.readStdinLine(),
        },
        unsigned_overflow: "error",
      });
      return { status: "ok", message: `exit code ${code}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.stderr(msg + "\n");
      const isSyntax = /line \d+|syntax|unexpected/i.test(msg);
      return { status: isSyntax ? "compile-error" : "runtime-error", message: msg };
    }
  },

  stop() {
    // interpreter synchroniczny — stop jest niezauważalny w main-thread (limitacja POC)
  },
};
