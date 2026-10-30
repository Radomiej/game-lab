import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";

// Sloty zarezerwowane dla ciężkich runtime — szczegóły w README (sekcja Roadmap).
function planned(id: string, label: string, exts: string[], plan: string): LabRuntime {
  return {
    id,
    label,
    extensions: exts,
    async run(_req: RunRequest, host: LabHost): Promise<RunResult> {
      host.stderr(`${label}: nakładka nie podpięta w tym prototypie.\n${plan}\n`);
      return { status: "runtime-error", message: "not wired" };
    },
    stop() {},
  };
}

export const luauRuntime = planned(
  "luau",
  "Luau (Roblox)",
  ["luau"],
  "Slot: Luau (fork Lua 5.1 Robloxa) ma OFICJALNY target webowy w repo\n" +
    "luau-lang/luau — 'Luau.Web' budowany przez Emscripten (napędza demo\n" +
    "na luau-lang.org). Nakładka = vendored luau.wasm + ten sam kontrakt LRP\n" +
    "co wasmoon. Alternatywa lekka: transpiler podzbioru Luau->Lua 5.4\n" +
    "(strip typów, += -> =, continue -> goto) — bez pełnej zgodności.",
);
