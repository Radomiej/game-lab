import { transform } from "sucrase";
import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade, LabStop } from "../core/host";

// JavaScript/TypeScript: kod ucznia jest body funkcji; może zdefiniować
// init() i update(dt) — wtedy host odpala pętlę. Bez nich: tryb konsoli.
// main-thread = ograniczenie POC; docelowo Web Worker jak w java-lab.
function makeRuntime(id: "javascript" | "typescript", label: string, ts: boolean): LabRuntime {
  let aborted = false;

  return {
    id,
    label,
    extensions: ts ? ["ts"] : ["js", "mjs"],

    async run(req: RunRequest, host: LabHost): Promise<RunResult> {
      aborted = false;
      let source = req.files[req.entry];
      if (source == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };

      if (ts) {
        try {
          source = transform(source, { transforms: ["typescript"] }).code;
        } catch (err) {
          return { status: "compile-error", message: String(err) };
        }
      }

      const lab = createLabFacade(host, id);
      const stdio = { log: lab.print, input: lab.input };

      let hooks: { init?: () => void; update?: (dt: number) => void };
      try {
        const factory = new Function(
          "lab",
          "console",
          "print",
          "input",
          `"use strict";\n${source}\n;return { init: typeof init === "function" ? init : undefined, update: typeof update === "function" ? update : undefined };`,
        ) as (lab: unknown, c: unknown, p: unknown, i: unknown) => typeof hooks;
        hooks = factory(lab, stdio, lab.print, lab.input);
      } catch (err) {
        if (err instanceof SyntaxError) return { status: "compile-error", message: String(err) };
        if (err instanceof LabStop || aborted) return { status: "stopped" };
        host.stderr(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
        return { status: "runtime-error", message: String(err) };
      }

      if (hooks?.update) {
        const update = hooks.update;
        const init = hooks.init;
        await host.startGameLoop(
          (dt) => {
            if (aborted) throw new LabStop();
            return update(dt);
          },
          init
            ? () => {
                if (aborted) throw new LabStop();
                return init();
              }
            : undefined,
        );
        return { status: aborted ? "stopped" : "ok" };
      }
      return { status: aborted ? "stopped" : "ok" };
    },

    stop() {
      aborted = true;
    },
  };
}

export const javascriptRuntime = makeRuntime("javascript", "JavaScript", false);
export const typescriptRuntime = makeRuntime("typescript", "TypeScript", true);
