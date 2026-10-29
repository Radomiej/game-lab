// Scene View — przegląd całej sceny jak w Unity: wszystkie GameObjecty,
// granice świata i prostokąt kamery. Pan = przeciąganie, zoom = kółko,
// dwuklik = dopasuj do sceny. Dane bierze z działającej gry GameLab.
import { assetManifest, type LabEngineGame } from "../engine/index";
import { userAssets } from "../core/userAssets";
import { atlasImage } from "./assetThumbs";

interface Drawable {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  texture?: string;
  color?: string;
}

const DEFAULT_BOUNDS = { x: 0, y: 0, w: 640, h: 480 };

export class SceneView {
  private ctx: CanvasRenderingContext2D;
  private cam = { x: 0, y: 0, scale: 0.4 };
  private fitted = false;
  private timer = 0;
  private raf = 0;
  private detach: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getGame: () => LabEngineGame | null,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.attach();
  }

  show(): void {
    this.resize();
    this.fitted = false;
    this.timer = window.setInterval(() => this.redraw(), 200);
  }

  hide(): void {
    clearInterval(this.timer);
    this.timer = 0;
    cancelAnimationFrame(this.raf);
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(64, Math.round(r.width * dpr));
    this.canvas.height = Math.max(64, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  private attach(): void {
    let drag: { sx: number; sy: number; cx: number; cy: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y };
      this.canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      this.cam.x = drag.cx - (e.clientX - drag.sx) / this.cam.scale;
      this.cam.y = drag.cy - (e.clientY - drag.sy) / this.cam.scale;
      this.redraw();
    };
    const up = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const s = Math.min(8, Math.max(0.02, this.cam.scale * k));
      this.cam.x = mx / this.cam.scale - mx / s + this.cam.x;
      this.cam.y = my / this.cam.scale - my / s + this.cam.y;
      this.cam.scale = s;
      this.redraw();
    };
    const dbl = () => {
      this.fitted = false;
      this.redraw();
    };
    this.canvas.addEventListener("pointerdown", down);
    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", up);
    this.canvas.addEventListener("wheel", wheel, { passive: false });
    this.canvas.addEventListener("dblclick", dbl);
    this.detach.push(() => {
      for (const [t, f] of [
        ["pointerdown", down],
        ["pointermove", move],
        ["pointerup", up],
        ["pointercancel", up],
        ["dblclick", dbl],
      ] as Array<[string, EventListener]>)
        this.canvas.removeEventListener(t, f);
      this.canvas.removeEventListener("wheel", wheel);
    });
  }

  dispose(): void {
    this.hide();
    for (const d of this.detach) d();
  }

  private collect(): { drawables: Drawable[]; view: { x: number; y: number; w: number; h: number } | null; bounds: typeof DEFAULT_BOUNDS | null } {
    const game = this.getGame();
    if (!game || game.disposed) return { drawables: [], view: null, bounds: null };
    const drawables: Drawable[] = [];
    const objects = (game.objects ?? []) as Array<Record<string, any>>;
    for (const o of objects) {
      if (o.destroyed || !o.active) continue;
      const t = o.transform ?? {};
      const comp = (o.components ?? []).find((c: Record<string, any>) => c.texture !== undefined || c.width !== undefined);
      const sx = t.scale?.x ?? 1, sy = t.scale?.y ?? 1;
      const w = (comp?.width ?? 24) * Math.abs(sx), h = (comp?.height ?? 24) * Math.abs(sy);
      drawables.push({
        name: String(o.name ?? "Object"),
        x: t.x ?? 0,
        y: t.y ?? 0,
        w,
        h,
        texture: comp?.texture,
        color: comp?.color,
      });
    }
    const cv = (game.cameraView ?? { x: 0, y: 0 }) as { x: number; y: number };
    const gcanvas = game.canvas as { width?: number; height?: number } | undefined;
    const view = { x: cv.x, y: cv.y, w: gcanvas?.width ?? DEFAULT_BOUNDS.w, h: gcanvas?.height ?? DEFAULT_BOUNDS.h };
    const wb = game.worldBounds as { x: number; y: number; width: number; height: number } | null | undefined;
    const bounds = wb ? { x: wb.x, y: wb.y, w: wb.width, h: wb.height } : null;
    return { drawables, view, bounds };
  }

  private fit(drawables: Drawable[], view: { x: number; y: number; w: number; h: number } | null, bounds: typeof DEFAULT_BOUNDS | null): void {
    const r = this.canvas.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x1: number, y1: number, x2: number, y2: number) => {
      minX = Math.min(minX, x1); minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2);
    };
    grow(DEFAULT_BOUNDS.x, DEFAULT_BOUNDS.y, DEFAULT_BOUNDS.x + DEFAULT_BOUNDS.w, DEFAULT_BOUNDS.y + DEFAULT_BOUNDS.h);
    for (const d of drawables) grow(d.x - d.w / 2, d.y - d.h / 2, d.x + d.w / 2, d.y + d.h / 2);
    if (view) grow(view.x, view.y, view.x + view.w, view.y + view.h);
    if (bounds) grow(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h);
    const pad = 24;
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    this.cam.scale = Math.min((r.width - pad) / w, (r.height - pad) / h);
    this.cam.x = (minX + maxX) / 2 - r.width / 2 / this.cam.scale;
    this.cam.y = (minY + maxY) / 2 - r.height / 2 / this.cam.scale;
    this.fitted = true;
  }

  private redraw(): void {
    const { drawables, view, bounds } = this.collect();
    if (!this.fitted) this.fit(drawables, view, bounds);
    const ctx = this.ctx;
    const r = this.canvas.getBoundingClientRect();
    const s = this.cam.scale;

    ctx.clearRect(0, 0, r.width, r.height);
    ctx.fillStyle = "#0b1119";
    ctx.fillRect(0, 0, r.width, r.height);

    // siatka co 50 px świata
    ctx.strokeStyle = "rgba(101, 214, 200, 0.05)";
    ctx.lineWidth = 1;
    const step = 50;
    const startX = Math.floor(this.cam.x / step) * step;
    const startY = Math.floor(this.cam.y / step) * step;
    ctx.beginPath();
    for (let x = startX; x < this.cam.x + r.width / s; x += step) {
      ctx.moveTo((x - this.cam.x) * s, 0);
      ctx.lineTo((x - this.cam.x) * s, r.height);
    }
    for (let y = startY; y < this.cam.y + r.height / s; y += step) {
      ctx.moveTo(0, (y - this.cam.y) * s);
      ctx.lineTo(r.width, (y - this.cam.y) * s);
    }
    ctx.stroke();

    const tr = (x: number, y: number) => ({ x: (x - this.cam.x) * s, y: (y - this.cam.y) * s });

    if (bounds) {
      const p = tr(bounds.x, bounds.y);
      ctx.strokeStyle = "rgba(232, 193, 105, 0.55)";
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(p.x, p.y, bounds.w * s, bounds.h * s);
      ctx.setLineDash([]);
    }

    const entries = new Map(assetManifest.assets.map((a) => [a.key, a]));
    for (const d of drawables) {
      const p = tr(d.x, d.y);
      const dw = d.w * s, dh = d.h * s;
      const u = d.texture ? userAssets.get(d.texture) : undefined;
      const entry = d.texture ? entries.get(d.texture) : undefined;
      const img = u?.image ?? (entry ? atlasImage(entry.source) : undefined);
      if (img && (u || (entry && (img as HTMLImageElement).complete))) {
        if (u) ctx.drawImage(img, p.x - dw / 2, p.y - dh / 2, dw, dh);
        else if (entry) {
          const f = entry.frame;
          ctx.drawImage(img, f.x, f.y, f.w, f.h, p.x - dw / 2, p.y - dh / 2, dw, dh);
        }
      } else {
        ctx.fillStyle = d.color ?? "#65d6c8";
        ctx.globalAlpha = 0.75;
        ctx.fillRect(p.x - dw / 2, p.y - dh / 2, dw, dh);
        ctx.globalAlpha = 1;
      }
      if (s > 0.18) {
        ctx.fillStyle = "rgba(232, 244, 248, 0.85)";
        ctx.font = `600 ${Math.max(8, Math.min(11, 10 * Math.sqrt(s)))}px ui-monospace, Consolas, monospace`;
        ctx.textAlign = "center";
        ctx.fillText(d.name, p.x, p.y - dh / 2 - 4);
      }
    }

    if (view) {
      const p = tr(view.x, view.y);
      ctx.strokeStyle = "rgba(124, 226, 214, 0.9)";
      ctx.setLineDash([8, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x, p.y, view.w * s, view.h * s);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(124, 226, 214, 0.9)";
      ctx.font = "600 9px ui-monospace, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText("kamera", p.x + 4, p.y + 12);
    }

    if (!drawables.length && !view) {
      ctx.fillStyle = "rgba(159, 179, 196, 0.7)";
      ctx.font = "11px ui-monospace, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Scene View — uruchom grę GameLab, żeby zobaczyć obiekty", r.width / 2, r.height / 2);
    }
  }
}
