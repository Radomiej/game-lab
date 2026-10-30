import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade } from "../core/host";
import { getActiveGame, getActiveEngine, labEngineDisposed } from "../engine/index";

// C# — @wasmsharp/core: prawdziwy .NET runtime (dotnet.native.wasm) +
// Roslyn kompilujący kod ucznia do IL i uruchamiający go w przeglądarce.
// ~41 MB przy pierwszym load — leniwe pobieranie, potem z cache przeglądarki.
//
// Interop: WASM moduł jest odcięty od JS (brak JSHost.ImportAsync w tej
// binarce, wewnętrzne InvokeJSImport* wymagają Span<> nie-refleksyjnego),
// dlatego Lab.* emituje ops na stdout jako linie `__LAB__|...` —
// host aplikuje je w KOLEJNOŚCI po zakończeniu skryptu (jak zapisy Javy,
// tylko zbatche'owane). Odczyt wartości w trakcie skryptu: niedostępny —
// adresowanie przez nazwę komponentu (`SetNumByKind`) zamiast id.
// Klasa pomocnicza Lab doklejana ZA kodem ucznia (top-level statements).
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

type LabFacade = ReturnType<typeof createLabFacade>;

let modulePromise: Promise<WasmSharpModuleT> | null = null;

// Escape do literału C# "..."
const csLit = (s: string): string =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "")}"`;

// Snapshot świata z chwili RUN — wstrzykiwany jako literał słownika
// do Lab.cs. FindComponent/GetNum/GetStr czytają z t=0 (deterministycznie:
// ops i tak aplikują się po skrypcie, więc "teraz" = start biegu).
function snapshotLiteral(lab: LabFacade): string {
  const entries: string[] = [];
  for (const c of lab.worldInfo()) {
    const props: Record<string, string> = { __kind__: c.kind };
    for (const m of c.bridge.listMembers?.() ?? []) {
      if (m.kind === "prop") {
        try {
          props[m.name] = String(c.bridge.get(m.name) ?? "");
        } catch {
          /* pomijamy nieczytelne pola */
        }
      }
    }
    const inner = Object.entries(props)
      .map(([k, v]) => `{${csLit(k)}, ${csLit(v)}}`)
      .join(", ");
    entries.push(
      `{ ${c.id}, new System.Collections.Generic.Dictionary<string,string> { ${inner} } }`,
    );
  }
  return entries.join(",\n        ");
}

const labCs = (snapshot: string) => `public static class Lab {
    private static int nextToken = -1;
    private static readonly System.Collections.Generic.Dictionary<int, System.Collections.Generic.Dictionary<string,string>> __snap =
        new System.Collections.Generic.Dictionary<int, System.Collections.Generic.Dictionary<string,string>> {
        ${snapshot}
        };
    private static void Emit(string op, params object[] args) {
        var sb = new System.Text.StringBuilder("__LAB__|" + op);
        foreach (var a in args) {
            sb.Append('|');
            if (a is double || a is float || a is decimal)
                sb.Append(System.Convert.ToString(a, System.Globalization.CultureInfo.InvariantCulture));
            else
                sb.Append(a?.ToString() ?? "");
        }
        System.Console.WriteLine(sb.ToString());
    }
    // Token klienta (ujemny) — host mapuje na prawdziwe id obiektu.
    public static int Spawn(string name = "") { int t = nextToken--; Emit("spawn", t, name); return t; }
    public static void DestroyObject(int obj) => Emit("destroy", obj);
    public static void SetPosition(int obj, double x, double y) => Emit("setPosition", obj, x, y);
    public static void AttachRenderer(int obj, string texture, double w, double h) => Emit("attachRenderer", obj, texture, w, h);
    public static void SetNum(int comp, string prop, double v) => Emit("setNum", comp, prop, v);
    public static void SetStr(int comp, string prop, string v) => Emit("setStr", comp, prop, v);
    public static void SetNumByKind(string kind, string prop, double v) => Emit("setNumByKind", kind, prop, v);
    public static void Call(int comp, string method, string argsJson = "[]") => Emit("call", comp, method, argsJson);
    public static void CallByKind(string kind, string method, string argsJson = "[]") => Emit("callByKind", kind, method, argsJson);
    // Odczyty — snapshot z chwili RUN (kod nie może wołać hosta w trakcie).
    public static int FindComponent(string kind) {
        foreach (var kv in __snap)
            if (kv.Value.TryGetValue("__kind__", out var k) && k == kind) return kv.Key;
        return 0;
    }
    public static double GetNum(int comp, string prop) {
        if (__snap.TryGetValue(comp, out var d) && d.TryGetValue(prop, out var s)
            && double.TryParse(s, System.Globalization.CultureInfo.InvariantCulture, out var v)) return v;
        return 0;
    }
    public static string GetStr(int comp, string prop) {
        if (__snap.TryGetValue(comp, out var d) && d.TryGetValue(prop, out var s)) return s;
        return "";
    }
    public static void Print(string msg) => Emit("print", msg);
}
`;

function jsonArgs(v: string): unknown[] {
  try {
    const p = JSON.parse(v || "[]");
    return Array.isArray(p) ? p : [p];
  } catch {
    return [];
  }
}

function unesc(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\p/g, "|").replace(/\\\\/g, "\\");
}

// Aplikuje linie __LAB__ ze stdout w kolejności; zwraca stdout bez nich.
function applyLabOps(stdout: string, lab: LabFacade): string {
  const kept: string[] = [];
  const tokens = new Map<number, number>();
  const idOf = (raw: string): number => {
    const n = Number(raw);
    return n < 0 ? (tokens.get(n) ?? 0) : n;
  };
  const compOf = (raw: string): number => {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
    return lab.findComponent(unesc(raw)) ?? 0;
  };
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("__LAB__|")) {
      kept.push(line);
      continue;
    }
    const p = line.slice(8).split("|");
    try {
      switch (p[0]) {
        case "spawn": {
          const id = lab.spawn(unesc(p[2] ?? "") || undefined);
          tokens.set(Number(p[1]), id);
          break;
        }
        case "destroy": lab.destroyObject(idOf(p[1])); break;
        case "setPosition": lab.setPosition(idOf(p[1]), Number(p[2]), Number(p[3])); break;
        case "attachRenderer":
          lab.attachRenderer(idOf(p[1]), { type: "sprite", texture: unesc(p[2]), width: Number(p[3]), height: Number(p[4]) });
          break;
        case "setNum": lab.setProp(compOf(p[1]), unesc(p[2]), Number(p[3])); break;
        case "setStr": lab.setProp(compOf(p[1]), unesc(p[2]), unesc(p[3] ?? "")); break;
        case "setNumByKind": {
          const comp = lab.findComponent(unesc(p[1]));
          if (comp) lab.setProp(comp, unesc(p[2]), Number(p[3]));
          break;
        }
        case "call": lab.call(compOf(p[1]), unesc(p[2]), ...jsonArgs(p.slice(3).join("|"))); break;
        case "callByKind": {
          const comp = lab.findComponent(unesc(p[1]));
          if (comp) lab.call(comp, unesc(p[2]), ...jsonArgs(p.slice(3).join("|")));
          break;
        }
        case "print": lab.print(unesc(p.slice(1).join("|"))); break;
        case "noop": break;
      }
    } catch (err) {
      lab.print(`[cs->lab] błąd op ${p[0]}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return kept.join("\n");
}

// public/vendor/wasmsharp = spatchowana kopia @wasmsharp/core
// (scripts/vendor-wasmsharp.mjs) — czysty ESM, omija bundler i pielenie Node-izmów.
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
    onProgress("C# gotowy (.NET WASM + Roslyn + Lab.*)");
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    const mod = await modulePromise!.catch(() => null);
    if (!mod) return { status: "runtime-error", message: "runtime nie załadowany" };
    const source = req.files[req.entry];
    if (source == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };

    const lab = createLabFacade(host, "cs", { files: req.files });
    try {
      const compilation = await mod.createCompilationAsync(source + "\n" + labCs(snapshotLiteral(lab)));
      const result = await compilation.run();
      if (result.success) {
        if (result.stdOut) host.stdout(applyLabOps(result.stdOut, lab));
        if (result.stdErr) host.stderr(result.stdErr);

        // Ops mogły zmaterializować scenę — trzymaj do Stop jak Lua/Python.
        const game = getActiveGame();
        if (game) {
          host.onPaused = (p) => (p ? game.pause() : game.resume());
          try {
            await host.startGameLoop(() => {});
          } finally {
            host.onPaused = undefined;
          }
        }
        return { status: "ok" };
      }
      for (const d of result.diagnostics) host.stderr(`${d.id}: ${d.message}\n`);
      return { status: "compile-error", message: `${result.diagnostics.length} diagnostyk` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.stderr(msg + "\n");
      return { status: "runtime-error", message: msg };
    } finally {
      getActiveEngine()?.dispose();
      labEngineDisposed();
    }
  },

  stop() {
    // kompilacja/running w workerze dotnet — bez twardego stop w POC
  },
};
