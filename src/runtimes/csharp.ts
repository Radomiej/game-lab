import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";

// C# — @wasmsharp/core: prawdziwy .NET runtime (dotnet.native.wasm) +
// Roslyn kompilujący kod ucznia do IL i uruchamiający go w przeglądarce.
// ~41 MB przy pierwszym load — leniwe pobieranie, potem z cache przeglądarki.
// Konsola tylko: student code nie ma mostu do lab.* (WASM moduł działa w
// izolacji; most do świata wymagałby własnego host-assembly z JSExport).
type WasmSharpModuleT = {
  createCompilationAsync(code: string): Promise<{
    run(): Promise<{
      success: boolean;
      stdOut: string | null;
      stdErr: string | null;
      diagnostics: { id: string; message: string; severity: string }[];
    }>;
  }>;
};

let modulePromise: Promise<WasmSharpModuleT> | null = null;

// public/vendor/wasmsharp = spatchowana kopia @wasmsharp/core
// (scripts/vendor-wasmsharp.mjs) — czysty ESM, omija bundler i pielenie Node-izmów.
// Absolutny URL (nie literal) — Vite nie dodaje ?import, przeglądarka ładuje
// moduł natywnie i wszystkie wewnętrzne importy/asset resolve idą surowo.
const WASM_SHARP_URL = new URL(
  `${(import.meta as any).env?.BASE_URL ?? "/"}vendor/wasmsharp/index.js`,
  window.location.origin,
).href;

export const csharpRuntime: LabRuntime = {
  id: "csharp",
  label: "C#",
  extensions: ["cs"],

  async load(onProgress: (msg: string) => void): Promise<void> {
    if (!modulePromise) {
      modulePromise = import(/* @vite-ignore */ WASM_SHARP_URL).then((m) =>
        m.WasmSharpModule.initializeAsync({
          disableWebWorker: true, // localny prototyp — bez wymogu HTTPS
          onDownloadResourceProgress: (done: number, total: number) =>
            onProgress(`pobieranie .NET+Roslyn ${done}/${total}`),
        }) as Promise<WasmSharpModuleT>,
      );
    }
    onProgress("start .NET WASM + Roslyn…");
    await modulePromise;
    onProgress("C# gotowy (.NET WASM + Roslyn)");
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    const mod = await modulePromise!.catch(() => null);
    if (!mod) return { status: "runtime-error", message: "runtime nie załadowany" };
    const source = req.files[req.entry];
    if (source == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };

    try {
      const compilation = await mod.createCompilationAsync(source);
      const result = await compilation.run();
      if (result.success) {
        if (result.stdOut) host.stdout(result.stdOut);
        if (result.stdErr) host.stderr(result.stdErr);
        return { status: "ok" };
      }
      for (const d of result.diagnostics) host.stderr(`${d.id}: ${d.message}\n`);
      return { status: "compile-error", message: `${result.diagnostics.length} diagnostyk` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.stderr(msg + "\n");
      return { status: "runtime-error", message: msg };
    }
  },

  stop() {
    // kompilacja/running w workerze dotnet — bez twardego stop w POC
  },
};
