import { transform } from "sucrase";
import type { LabHost, LabRuntime, RunRequest, RunResult } from "../core/protocol";
import { createLabFacade, LabStop } from "../core/host";
import { createLabEngine, labEngineDisposed, type GameLabApi } from "../engine/index";

// JavaScript/TypeScript: kod ucznia jest body funkcji; może zdefiniować
// init() i update(dt) — wtedy host odpala pętlę. Bez nich: tryb konsoli.
// Playground: wszystkie pliki tego samego rozszerzenia sklejone są w jedną
// jednostkę — nie-startowe najpierw (helpers, klasy), plik startowy na końcu,
// więc jego init()/update() wygrywa. console.* mapowane jak w labach.
// main-thread = ograniczenie POC; docelowo Web Worker jak w java-lab.
function makeRuntime(id: "javascript" | "typescript", label: string, ts: boolean): LabRuntime {
  let aborted = false;

  return {
    id,
    label,
    extensions: ts ? ["ts"] : ["js", "mjs"],

    async run(req: RunRequest, host: LabHost): Promise<RunResult> {
      aborted = false;
      const entrySrc = req.files[req.entry];
      if (entrySrc == null) return { status: "compile-error", message: `brak pliku ${req.entry}` };

      const exts = ts ? [".ts"] : [".js", ".mjs"];
      const isCode = (n: string) => exts.some((e) => n.endsWith(e));
      const helpers = Object.keys(req.files).filter((n) => n !== req.entry && isCode(n));
      let source = [...helpers, req.entry]
        .map((n) => `// ==== ${n} ====\n${req.files[n]}`)
        .join("\n");

      if (ts) {
        try {
          source = transform(source, { transforms: ["typescript"] }).code;
        } catch (err) {
          return { status: "compile-error", message: String(err) };
        }
      }

      const lab = createLabFacade(host, id, { files: req.files });
      // console.* jak w labach: log/info/debug → "> ", warn → "⚠ ", error → "Błąd: "
      const join = (args: unknown[]) =>
        args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") + "\n";
      const stdio = {
        log: (...a: unknown[]) => host.stdout(join(a)),
        info: (...a: unknown[]) => host.stdout(join(a)),
        debug: (...a: unknown[]) => host.stdout(join(a)),
        warn: (...a: unknown[]) => host.warn(join(a)),
        error: (...a: unknown[]) => host.stderr(join(a)),
        input: lab.input,
      };

      // Pełny silnik z labów: GameLab.Game/GameObject/Component/Sprite —
      // kod przekopiowany z web-learning-lab/java-lab działa 1:1.
      const GameLab: GameLabApi | null = host.canvasEl ? createLabEngine(host.canvasEl) : null;

      let hooks: { init?: () => void; update?: (dt: number) => void; getFn?: (n: string) => unknown };
      try {
        const factory = new Function(
          "lab",
          "console",
          "print",
          "input",
          "GameLab",
          `"use strict";\n${source}\n;return { init: typeof init === "function" ? init : undefined, update: typeof update === "function" ? update : undefined, getFn: (n) => { try { return eval("typeof " + n + " === 'function' ? " + n + " : undefined"); } catch { return undefined; } } };`,
        ) as (lab: unknown, c: unknown, p: unknown, i: unknown, g: unknown) => typeof hooks;
        hooks = factory(lab, stdio, lab.print, lab.input, GameLab);
      } catch (err) {
        GameLab?.dispose();
        labEngineDisposed();
        if (err instanceof SyntaxError) return { status: "compile-error", message: String(err) };
        if (err instanceof LabStop || aborted) return { status: "stopped" };
        host.stderr(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
        return { status: "runtime-error", message: String(err) };
      }

      // Metoda startowa z ustawień projektu — wywoływana raz po załadowaniu.
      if (req.entryMethod) {
        const boot = hooks?.getFn?.(req.entryMethod);
        if (typeof boot === "function") {
          try {
            boot();
          } catch (err) {
            host.stderr(`[${req.entryMethod}] ${err instanceof Error ? err.message : String(err)}\n`);
          }
        } else {
          host.warn(`brak metody '${req.entryMethod}' — używam init()/update()\n`);
        }
      }

      // Gra na silniku labów — własna pętla rAF + konsola LAB·BOY; nasza
      // pętla trzyma tylko żywotność run() (STOP/restart/pauza z IDE).
      const game = GameLab?.current;
      if (game) {
        const onEngineError = (e: Event) => {
          const err = (e as ErrorEvent).error ?? e;
          host.stderr(`[game] ${err instanceof Error ? err.message : String(err)}\n`);
        };
        window.addEventListener("error", onEngineError);
        host.onPaused = (p) => {
          if (p) game.pause();
          else game.resume();
        };
        try {
          await host.startGameLoop(() => {
            if (aborted) throw new LabStop();
          });
        } finally {
          window.removeEventListener("error", onEngineError);
          host.onPaused = undefined;
          GameLab!.dispose();
          labEngineDisposed();
        }
        return { status: aborted ? "stopped" : "ok" };
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
