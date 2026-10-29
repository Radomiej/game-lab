import { LuaFactory, type LuaEngine, type LuaMultiReturn } from "wasmoon";
import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade } from "../core/host";
import type { ComponentBridge } from "../core/world";

// wasmoon = prawdziwy Lua 5.4 skompilowany do WASM (~500 KB, z dist/glue.wasm).
// Engine jest TRWAŁY między RUN-ami — komponenty zarejestrowane w jednym
// uruchomieniu pozostają wywoływalne z kodu w innych językach (interop).
let engine: LuaEngine | null = null;

function classify(msg: string): "compile-error" | "runtime-error" {
  return /syntax error|unexpected/i.test(msg) ? "compile-error" : "runtime-error";
}

export const luaRuntime: LabRuntime = {
  id: "lua",
  label: "Lua",
  extensions: ["lua"],

  async load(onProgress: (msg: string) => void): Promise<void> {
    if (engine) return;
    onProgress("ładowanie Lua 5.4 (wasmoon)…");
    const factory = new LuaFactory();
    engine = await factory.createEngine({
      openStandardLibs: true,
      injectObjects: true,
      enableProxy: true,
      functionTimeout: 1500, // ochrona przed while(true) w kodzie ucznia
    });
    onProgress("Lua gotowy");
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    if (!engine) return { status: "runtime-error", message: "runtime nie załadowany" };
    const source = req.files[req.entry];
    if (source == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };
    const st = engine;

    const lab = createLabFacade(host, "lua");

    // attachComponent: tabela Lua przychodzi jako proxy — mostek
    // woła metody z self na pierwszym argumencie (konwencja `:`).
    const labForLua = {
      ...lab,
      attachComponent(objectId: number, kind: string, impl: Record<string, unknown>): number {
        const bridge: ComponentBridge = {
          get: (k) => impl[k],
          set: (k, v) => {
            impl[k] = v;
          },
          invoke: (m, args) => {
            const fn = impl[m];
            return typeof fn === "function" ? (fn as (...a: unknown[]) => unknown)(impl, ...args) : undefined;
          },
          listMembers: () =>
            Object.keys(impl).map((k) => ({
              name: k,
              kind: typeof impl[k] === "function" ? ("method" as const) : ("prop" as const),
            })),
        };
        return lab.attachBridge(objectId, kind, bridge);
      },
    };
    st.global.set("lab", labForLua);
    st.global.set("print", (...args: unknown[]) =>
      lab.print(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join("\t")),
    );

    let runError: RunResult | null = null;
    try {
      await st.doString(source);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runError = { status: classify(msg), message: msg };
    }
    if (runError) return runError;

    // init()/update(dt) po stronie ucznia; sprzątamy globalne po biegu
    const updateFn = st.global.get("update") as unknown;
    const initFn = st.global.get("init") as unknown;
    const hasUpdate = typeof updateFn === "function";
    const hasInit = typeof initFn === "function";

    const call = (fn: unknown, dt?: number): unknown =>
      (fn as (...a: unknown[]) => unknown)(...(dt === undefined ? [] : [dt]));

    try {
      if (hasUpdate) {
        await host.startGameLoop(
          (dt) => call(updateFn, dt) as void,
          hasInit ? () => call(initFn) as void : undefined,
        );
      } else if (hasInit) {
        call(initFn);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      host.stderr(msg + "\n");
      return { status: "runtime-error", message: msg };
    } finally {
      st.global.set("update", null);
      st.global.set("init", null);
    }

    return { status: "ok" };
  },

  stop() {
    // pętlę zatrzymuje host.requestStop() z UI
  },
};
