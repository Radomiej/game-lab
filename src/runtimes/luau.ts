import {
  Lua,
  LuaFunction,
  LuaTable,
  type IntoLuaValue,
  type LuaCallbackResult,
  type LuaOutputEvent,
} from "@luau-rs/luau";
import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade } from "../core/host";
import type { ComponentBridge } from "../core/world";
import { getActiveEngine, getActiveGame, labEngineDisposed } from "../engine/index";

// @luau-rs/luau = prawdziwy Luau (Roblox) skompilowany do WASM — pełny
// język: typy adnotowane, +=, continue, string interpolation, namecall.
// Stan jest TRWAŁY między RUN-ami jak w wasmoon — komponenty zostają
// w WorldRegistry i są osiągalne z innych języków.
let lua: Lua | null = null;

function classify(msg: string): "compile-error" | "runtime-error" {
  return /syntax|parse|expected|unexpected/i.test(msg) ? "compile-error" : "runtime-error";
}

export const luauRuntime: LabRuntime = {
  id: "luau",
  label: "Luau",
  extensions: ["luau"],

  async load(onProgress: (msg: string) => void): Promise<void> {
    if (lua) return;
    onProgress("ładowanie Luau (@luau-rs/luau WASM)…");
    lua = await Lua.create({ libraries: "all" });
    onProgress("Luau gotowy");
  },

  async run(req: RunRequest, host: LabHost): Promise<RunResult> {
    if (!lua) return { status: "runtime-error", message: "runtime nie załadowany" };
    const source = req.files[req.entry];
    if (source == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };
    const L = lua;

    const lab = createLabFacade(host, "luau", { files: req.files });

    // Fasada lab jako tabela Luau — każda metoda to createFunction.
    // attachComponent: impl to LuaTable; metody wołane z self (konwencja `:`).
    const labTable = L.createTable();
    const fn = (name: string, f: (...a: unknown[]) => unknown) =>
      labTable.set(name, L.createFunction((...a) => f(...a) as LuaCallbackResult));
    for (const name of [
      "print", "drawRect", "drawCircle", "drawLine", "drawText", "clear",
      "spawn", "attachRenderer", "attachBridge", "setPosition", "getPosition",
      "setTransform", "getTransform", "getComponent", "findComponent",
      "getProp", "setProp", "call", "destroyObject", "worldInfo",
      "isKeyDown", "isKeyPressed", "readFile", "listFiles", "asset",
      "listAssets", "drawSprite",
    ] as const) {
      fn(name, (lab as Record<string, (...a: unknown[]) => unknown>)[name].bind(lab));
    }
    labTable.set(
      "attachComponent",
      L.createFunction((objectId: unknown, kind: unknown, impl: unknown) => {
        const t = impl as LuaTable;
        const bridge: ComponentBridge = {
          get: (k) => t.get(k),
          set: (k, v) => t.set(k, v as IntoLuaValue),
          invoke: (m, args) => {
            const f = t.get(m);
            return f instanceof LuaFunction ? f.call(t, ...(args as IntoLuaValue[]))[0] : undefined;
          },
          listMembers: () =>
            t.entries().map(([k, v]) => ({
              name: String(k),
              kind: v instanceof LuaFunction ? ("method" as const) : ("prop" as const),
            })),
        };
        return lab.attachBridge(Number(objectId), String(kind), bridge);
      }),
    );
    L.globals.set("lab", labTable);

    const onPrint = (e: LuaOutputEvent) => host.stdout(e.text + "\n");
    L.addEventListener("print", onPrint);

    let runError: RunResult | null = null;
    try {
      L.execute(source, { name: req.entry });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runError = { status: classify(msg), message: msg };
    }
    if (runError) {
      L.removeEventListener("print", onPrint);
      return runError;
    }

    const updateFn = L.globals.get("update");
    const initFn = L.globals.get("init");
    const hasUpdate = updateFn instanceof LuaFunction;
    const hasInit = initFn instanceof LuaFunction;

    try {
      if (hasUpdate) {
        await host.startGameLoop(
          (dt) => void updateFn.call(dt),
          hasInit ? () => void initFn.call() : undefined,
        );
      } else if (hasInit) {
        initFn.call();
      }
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
      L.removeEventListener("print", onPrint);
      L.globals.set("update", null);
      L.globals.set("init", null);
      getActiveEngine()?.dispose();
      labEngineDisposed();
    }

    return { status: "ok" };
  },

  stop() {
    // pętlę zatrzymuje host.requestStop() z UI
  },
};
