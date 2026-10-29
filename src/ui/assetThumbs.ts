// Miniatury sprite'ów silnika — klatka z atlasu rysowana do <canvas>.
// Atlasy ładujemy raz na źródło; niezaładowane miniatury domalują się po onload.
import type { AssetEntry } from "../engine/assets/Assets.js";

const atlases = new Map<string, HTMLImageElement>();
const pending = new Set<() => void>();

function atlas(source: string): HTMLImageElement {
  let img = atlases.get(source);
  if (!img) {
    img = new Image();
    img.onload = () => {
      for (const redraw of pending) redraw();
      pending.clear();
    };
    img.src = `/game-assets/${source}`;
    atlases.set(source, img);
  }
  return img;
}

/** Surowy obraz atlasu (Scene View rysuje klatki bezpośrednio). */
export function atlasImage(source: string): HTMLImageElement {
  return atlas(source);
}

export function spriteThumb(entry: AssetEntry, size = 34): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.className = "asset-thumb";
  const draw = () => {
    const img = atlas(entry.source);
    if (!img.complete || !img.naturalWidth) {
      pending.add(draw);
      return;
    }
    pending.delete(draw);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const f = entry.frame;
    const s = Math.min(size / f.w, size / f.h);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, f.x, f.y, f.w, f.h, (size - f.w * s) / 2, (size - f.h * s) / 2, f.w * s, f.h * s);
  };
  draw();
  return c;
}

export function imageThumb(img: HTMLImageElement, size = 34): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.className = "asset-thumb";
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const s = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  ctx.drawImage(img, (size - img.naturalWidth * s) / 2, (size - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  return c;
}
