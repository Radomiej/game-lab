import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade } from "../core/host";
import { getActiveGame, getActiveEngine, labEngineDisposed } from "../engine/index";

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

type BridgePayload = {
  objectId?: number;
  componentId?: number;
  kind?: string;
  name?: string;
  property?: string;
  value?: unknown;
  x?: number;
  y?: number;
  method?: string;
  args?: unknown[];
  spec?: Record<string, unknown>;
  code?: string;
  message?: string;
};

type LabFacade = ReturnType<typeof createLabFacade>;

let modulePromise: Promise<WasmSharpModuleT> | null = null;
let activeLab: LabFacade | null = null;

function dispatchLabInterop(operation: string, rawPayload: string): string {
  if (!activeLab) throw new Error("Lab interop is only available while a C# script is running");
  const lab = activeLab;
  const payload = JSON.parse(rawPayload || "{}") as BridgePayload;
  let result: unknown;

  switch (operation) {
    case "spawn": result = lab.spawn(payload.name); break;
    case "destroyObject": lab.destroyObject(Number(payload.objectId)); break;
    case "setPosition": lab.setPosition(Number(payload.objectId), Number(payload.x), Number(payload.y)); break;
    case "getPosition": {
      const position = lab.getPosition(Number(payload.objectId));
      result = position ? [position.x, position.y] : null;
      break;
    }
    case "attachRenderer": result = lab.attachRenderer(Number(payload.objectId), payload.spec ?? {}); break;
    case "getComponent": result = lab.getComponent(Number(payload.objectId), String(payload.kind ?? "")); break;
    case "findComponent": result = lab.findComponent(String(payload.kind ?? "")); break;
    case "getProp": result = lab.getProp(Number(payload.componentId), String(payload.property ?? "")); break;
    case "setProp": lab.setProp(Number(payload.componentId), String(payload.property ?? ""), payload.value); break;
    case "call": result = lab.call(Number(payload.componentId), String(payload.method ?? ""), ...(payload.args ?? [])); break;
    case "callByKind": {
      const componentId = lab.findComponent(String(payload.kind ?? ""));
      result = componentId == null ? null : lab.call(componentId, String(payload.method ?? ""), ...(payload.args ?? []));
      break;
    }
    case "isKeyDown": result = lab.isKeyDown(String(payload.code ?? "")); break;
    case "isKeyPressed": result = lab.isKeyPressed(String(payload.code ?? "")); break;
    case "width": result = lab.width(); break;
    case "height": result = lab.height(); break;
    case "print": lab.print(payload.message ?? ""); break;
    default: throw new Error(`Unknown LabBridge operation: ${operation}`);
  }

  try {
    return JSON.stringify(result ?? null);
  } catch (error) {
    throw new Error(`Lab interop result is not JSON serializable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const WASM_SHARP_URL = new URL(
  `${(import.meta as any).env?.BASE_URL ?? "/"}vendor/wasmsharp/index.js`,
  window.location.origin,
).href;
const LAB_BRIDGE_URL = new URL(
  `${(import.meta as any).env?.BASE_URL ?? "/"}vendor/wasmsharp/LabBridge.dll`,
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
          disableWebWorker: true,
          moduleImports: { invoke: dispatchLabInterop },
          onConfigLoaded(config: { resources?: { lazyAssembly?: { name: string; virtualPath: string; resolvedUrl: string }[] } }) {
            const lazyAssemblies = config.resources?.lazyAssembly ?? (config.resources!.lazyAssembly = []);
            for (const asset of [
              { name: "System.Runtime.dll", virtualPath: "System.Runtime.dll", resolvedUrl: new URL("System.Runtime.dll", new URL(LAB_BRIDGE_URL)).href },
              { name: "LabBridge.dll", virtualPath: "LabBridge.dll", resolvedUrl: LAB_BRIDGE_URL },
            ]) {
              if (!lazyAssemblies.some((existing) => existing.virtualPath === asset.virtualPath)) {
                lazyAssemblies.push(asset);
              }
            }
          },
          onDownloadResourceProgress: (done: number, total: number) =>
            onProgress(`pobieranie .NET+Roslyn ${done}/${total}`),
        }) as Promise<WasmSharpModuleT>,
      );
    }
    onProgress("start .NET WASM + Roslyn…");
    await modulePromise;
    onProgress("C# gotowy (.NET WASM + Roslyn + sync Lab.*)");
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    const mod = await modulePromise!.catch(() => null);
    if (!mod) return { status: "runtime-error", message: "runtime nie załadowany" };
    const source = req.files[req.entry];
    if (source == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };

    const lab = createLabFacade(host, "cs", { files: req.files });
    activeLab = lab;
    try {
      // Lab.* pochodzi z LabBridge.dll (namespace LabBridge) — using musi
      // być pierwszą linią, więc prepend jest zawsze bezpieczny.
      const compilation = await mod.createCompilationAsync("using LabBridge;\n" + source);
      const result = await compilation.run();
      if (result.success) {
        if (result.stdOut) host.stdout(result.stdOut);
        if (result.stdErr) host.stderr(result.stdErr);

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
      activeLab = null;
      getActiveEngine()?.dispose();
      labEngineDisposed();
    }
  },

  stop() {
    // WasmSharp does not expose a safe cancellation point during compilation.
  },
};
