import type { DrawCmd, LabHost } from "./protocol";
import { CanvasRenderer, InputTracker } from "./engine";
import { WorldRegistry, type ComponentBridge, type RegisteredComponent } from "./world";
import { assetManifest } from "../engine/assets/Assets.js";
import { userAssets } from "./userAssets";
import { getActiveGame } from "../engine/index";
import {
  bridgeAttachComponent,
  bridgeAttachRenderer,
  bridgeDestroyObject,
  bridgeGetTransform,
  bridgeSetTransform,
  bridgeSpawn,
  type RendererSpec,
} from "../engine/bridge";

/** Wewnętrzny sygnał zatrzymania pętli — nie jest błędem ucznia. */
export class LabStop extends Error {
  constructor() {
    super("stopped");
    this.name = "LabStop";
  }
}

/** Zlew konsoli — implementuje RuntimeConsole (forma jak w labach). */
export interface ConsoleSink {
  write(level: "log" | "sys" | "warn" | "error", text: string): void;
}

export class DomLabHost implements LabHost {
  private renderer: CanvasRenderer;
  private input = new InputTracker();

  private stdinLines: string[] = [];
  private framePressed = new Set<string>();
  private stopped = false;
  private paused = false;
  private loopAbort: (() => void) | null = null;

  /** Callback ~1×/s z realnym FPS pętli gry (podgląd w IDE). */
  onFps: ((fps: number) => void) | undefined;

  /** Canvas podglądu — silnik GameLab montuje na nim swój run(). */
  get canvasEl(): HTMLCanvasElement {
    return this.canvas;
  }

  onPaused: ((paused: boolean) => void) | undefined;

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.onPaused?.(paused);
  }
  get isPaused(): boolean {
    return this.paused;
  }

  constructor(
    private consoleOut: ConsoleSink,
    private canvas: HTMLCanvasElement,
  ) {
    this.renderer = new CanvasRenderer(canvas.getContext("2d")!);
  }

  begin(stdin?: string): void {
    this.stopped = false;
    this.paused = false;
    this.stdinLines = (stdin ?? "").split("\n").filter((_, i, a) => !(i === a.length - 1 && a[i] === ""));
    this.framePressed.clear();
    this.input.attach(this.canvas);
  }

  end(): void {
    this.input.release();
    this.loopAbort = null;
  }

  requestStop(): void {
    this.stopped = true;
    this.loopAbort?.();
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  stdout(text: string): void {
    this.consoleOut.write("log", text);
  }

  stderr(text: string): void {
    this.consoleOut.write("error", text);
  }

  warn(text: string): void {
    this.consoleOut.write("warn", text);
  }

  draw(cmds: DrawCmd[]): void {
    this.renderer.draw(cmds);
  }

  isKeyDown(code: string): boolean {
    return this.input.isDown(code);
  }

  takePressed(): Set<string> {
    return this.framePressed;
  }

  width(): number {
    return this.canvas.width;
  }

  height(): number {
    return this.canvas.height;
  }

  readStdinLine(): string | null {
    return this.stdinLines.shift() ?? null;
  }

  world(): WorldRegistry {
    return this._world;
  }

  clearWorld(): void {
    this._world.clear();
  }

  private readonly _world = new WorldRegistry();

  startGameLoop(
    update: (dt: number) => void | Promise<void>,
    init?: () => void | Promise<void>,
  ): Promise<void> {
    return new Promise((resolve) => {
      let raf = 0;
      let last = performance.now();
      let frames = 0;
      let fpsAt = last;
      this.loopAbort = () => {
        cancelAnimationFrame(raf);
        resolve();
      };
      const step = async (now: number) => {
        if (this.stopped) return resolve();
        // dt w sekundach, z clamp jak w java-lab (0.1 s)
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        frames++;
        if (now - fpsAt >= 1000) {
          this.onFps?.(Math.round((frames * 1000) / (now - fpsAt)));
          frames = 0;
          fpsAt = now;
        }
        if (this.paused) {
          raf = requestAnimationFrame(step);
          return;
        }
        this.framePressed = this.input.takePressed();
        // Interop: komponenty z innych języków tickują razem z klatką.
        // Zmostkowane do silnika pomijamy, gdy gra żyje — tickuje je silnik.
        await this._world.tick(
          dt,
          (c, err) =>
            this.stderr(`\n[${c.lang}:${c.kind}] ${err instanceof Error ? err.message : String(err)}\n`),
          getActiveGame() !== null,
        );
        try {
          await update(dt);
        } catch (err) {
          if (!(err instanceof LabStop)) {
            this.stderr(`\n[game] ${err instanceof Error ? err.message : String(err)}\n`);
          }
          return resolve();
        }
        raf = requestAnimationFrame(step);
      };
      (async () => {
        try {
          await init?.();
          raf = requestAnimationFrame(step);
        } catch (err) {
          this.stderr(`\n[init] ${err instanceof Error ? err.message : String(err)}\n`);
          resolve();
        }
      })();
    });
  }
}

// Wbudowane assety silnika — paleta kolorów tekstur przeniesiona z
// shared/lab-game-v2 (te same klucze, które znają uczniowie z labów).
// drawSprite rysuje dwukolorowy placeholder sprite'a: tło + akcent.
export const LAB_ASSETS: Record<string, { colors: [string, string] }> = {
  player: { colors: ["#76b9f2", "#17324d"] },
  slime: { colors: ["#70c994", "#123c2c"] },
  bat: { colors: ["#a98bd5", "#392c59"] },
  ghost: { colors: ["#c3edf2", "#527783"] },
  gem: { colors: ["#ffd166", "#9b631c"] },
  coin: { colors: ["#ffd166", "#9b631c"] },
  chest: { colors: ["#b77932", "#603b22"] },
  projectile: { colors: ["#8be9fd", "#ffffff"] },
  heart: { colors: ["#ef6a78", "#7d2938"] },
  wall: { colors: ["#889aa9", "#405563"] },
};

// Fasada "lab" wystawiana kodowi ucznia — ta sama w każdym języku.
// Nakładka mapuje ją na natywne API (globalne funkcje, moduł, header itd.).
// Interop: komponenty rejestrowane przez dowolny język są widoczne
// i wywoływalne z pozostałych — registry żyje w hoście, nie w runtime.
export function createLabFacade(host: LabHost, lang: string, ctx?: { files?: Record<string, string> }) {
  const world = host.world();
  const files = ctx?.files ?? {};
  const lab = {
    print(...args: unknown[]) {
      host.stdout(args.map(String).join(" ") + "\n");
    },
    drawRect(x: number, y: number, w: number, h: number, color = "#ffffff") {
      host.draw([{ op: "rect", x, y, w, h, color }]);
    },
    drawCircle(x: number, y: number, r: number, color = "#ffffff") {
      host.draw([{ op: "circle", x, y, r, color }]);
    },
    drawLine(x1: number, y1: number, x2: number, y2: number, color = "#ffffff") {
      host.draw([{ op: "line", x1, y1, x2, y2, color }]);
    },
    drawText(x: number, y: number, text: unknown, color = "#ffffff", size = 16) {
      host.draw([{ op: "text", x, y, text: String(text), color, size }]);
    },
    clear(color?: string) {
      host.draw([{ op: "clear", color }]);
    },
    isKeyDown(code: string) {
      return host.isKeyDown(code);
    },
    isKeyPressed(code: string) {
      return host.takePressed().has(code);
    },
    input(): string | null {
      return host.readStdinLine();
    },
    width() {
      return host.width();
    },
    height() {
      return host.height();
    },

    // ---- Pliki i assety projektu (playground à la laby) ----
    /** Treść pliku z projektu (np. assets/palette.json) albo null. */
    readFile(name: string): string | null {
      return files[name] ?? null;
    },
    listFiles(): string[] {
      return Object.keys(files);
    },
    /** Asset silnika (manifest lab-game-v2) albo dropnięty plik użytkownika. */
    asset(name: string): { key: string; kind: "engine" | "user"; w?: number; h?: number; colors?: string[] } | null {
      const entry = assetManifest.assets.find((a) => a.key === name);
      if (entry) return { key: name, kind: "engine", w: entry.frame.w, h: entry.frame.h, colors: LAB_ASSETS[name]?.colors };
      const u = userAssets.get(name);
      return u ? { key: name, kind: "user", w: u.w, h: u.h } : null;
    },
    listAssets(): string[] {
      return [...assetManifest.assets.map((a) => a.key), ...userAssets.list().map((a) => a.key)];
    },
    /** Sprite: user-grafika rysuje się realnie, klucze silnika jako paleta-placeholder. */
    drawSprite(name: string, x: number, y: number, w = 32, h = 32): void {
      const u = userAssets.get(name);
      if (u?.image) {
        host.draw([{ op: "image", image: u.image, x, y, w, h }]);
        return;
      }
      const a = LAB_ASSETS[name];
      if (!a && !assetManifest.assets.some((e) => e.key === name)) return;
      const [c1, c2] = a?.colors ?? ["#65d6c8", "#1d3a3f"];
      host.draw([
        { op: "rect", x, y, w, h, color: c2 },
        { op: "rect", x: x + w * 0.12, y: y + h * 0.12, w: w * 0.76, h: h * 0.76, color: c1 },
      ]);
    },

    // ---- Interop: GameObject + Component na handle'ach ----
    // Przy żywym silniku spawn/attach materializują się jako prawdziwe
    // GameObject/Component GameLab (transform, renderer, update z silnika).
    spawn(name?: string): number {
      const id = world.spawnObject(name);
      bridgeSpawn(host, id, name ?? `GameObject ${id}`);
      return id;
    },
    /** impl zależy od języka: obiekt JS / tabela Lua / obiekt Python — nakładka mostkuje. */
    attachComponent(objectId: number, kind: string, impl: unknown): number {
      const id = world.attach(objectId, kind, lang, toBridge(impl));
      bridgeAttachComponent(host, world.component(id)!);
      return id;
    },
    /** Wariant dla nakładek z własnym mostkiem (np. tabela Lua). */
    attachBridge(objectId: number, kind: string, bridge: ComponentBridge): number {
      const id = world.attach(objectId, kind, lang, bridge);
      bridgeAttachComponent(host, world.component(id)!);
      return id;
    },
    /** Renderer na obiekcie — bootuje silnik, jeśli jeszcze nie działa.
     *  spec: {type:'sprite'|'rect'|'circle'|'text', texture,width,height,color,text,fontSize,layer,order,space} */
    attachRenderer(objectId: number, spec: RendererSpec = {}): boolean {
      return bridgeAttachRenderer(host, objectId, spec);
    },
    setPosition(objectId: number, x: number, y: number): void {
      bridgeSetTransform(objectId, { x, y });
    },
    getPosition(objectId: number): { x: number; y: number } | null {
      const t = bridgeGetTransform(objectId);
      return t ? { x: t.x, y: t.y } : null;
    },
    /** Częściowa zmiana transformu: {x,y,rotation,scaleX,scaleY}. */
    setTransform(objectId: number, t: { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number }): void {
      bridgeSetTransform(objectId, t);
    },
    getTransform(objectId: number) {
      return bridgeGetTransform(objectId);
    },
    getComponent(objectId: number, kind: string): number | null {
      return world.findOnObject(objectId, kind) ?? null;
    },
    findComponent(kind: string): number | null {
      return world.find(kind) ?? null;
    },
    getProp(compId: number, name: string): unknown {
      return world.get(compId, name);
    },
    setProp(compId: number, name: string, value: unknown): void {
      world.set(compId, name, value);
    },
    call(compId: number, method: string, ...args: unknown[]): unknown {
      return world.call(compId, method, args);
    },
    destroyObject(objectId: number): void {
      world.destroyObject(objectId);
      bridgeDestroyObject(objectId);
    },
    worldInfo(): RegisteredComponent[] {
      return world.describe();
    },
  };

  // Domyślny mostek dla obiektów JS-podobnych (JS, TS; PyProxy zachowuje
  // się tak samo — getattr/setattr/call przez właściwości).
  function toBridge(impl: unknown): ComponentBridge {
    const o = impl as Record<string, unknown>;
    return {
      get: (k) => o[k],
      set: (k, v) => {
        o[k] = v;
      },
      invoke: (m, args) => (typeof o[m] === "function" ? (o[m] as (...a: unknown[]) => unknown)(...args) : undefined),
      listMembers: () =>
        Object.keys(o).map((k) => ({ name: k, kind: typeof o[k] === "function" ? ("method" as const) : ("prop" as const) })),
    };
  }

  return lab;
}
