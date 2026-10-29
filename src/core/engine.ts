import type { DrawCmd } from "./protocol";

export class CanvasRenderer {
  constructor(private ctx: CanvasRenderingContext2D) {}

  draw(cmds: DrawCmd[]): void {
    for (const c of cmds) {
      const ctx = this.ctx;
      switch (c.op) {
        case "clear":
          ctx.fillStyle = c.color ?? "#0a0c10";
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          break;
        case "rect":
          ctx.fillStyle = c.color;
          if (c.fill === false) {
            ctx.strokeStyle = c.color;
            ctx.strokeRect(c.x, c.y, c.w, c.h);
          } else {
            ctx.fillRect(c.x, c.y, c.w, c.h);
          }
          break;
        case "circle":
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
          if (c.fill === false) {
            ctx.strokeStyle = c.color;
            ctx.stroke();
          } else {
            ctx.fillStyle = c.color;
            ctx.fill();
          }
          break;
        case "line":
          ctx.beginPath();
          ctx.strokeStyle = c.color;
          ctx.lineWidth = c.width ?? 1;
          ctx.moveTo(c.x1, c.y1);
          ctx.lineTo(c.x2, c.y2);
          ctx.stroke();
          break;
        case "text":
          ctx.fillStyle = c.color;
          ctx.font = `${c.size ?? 16}px monospace`;
          ctx.fillText(c.text, c.x, c.y);
          break;
        case "image":
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(c.image, c.x, c.y, c.w, c.h);
          break;
      }
    }
  }
}

export class InputTracker {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private detach: (() => void) | null = null;

  attach(target: Window | HTMLElement): void {
    const onDown = (e: Event) => {
      const code = (e as KeyboardEvent).code;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    };
    const onUp = (e: Event) => this.down.delete((e as KeyboardEvent).code);
    const onBlur = () => this.down.clear();
    target.addEventListener("keydown", onDown);
    target.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    this.detach = () => {
      target.removeEventListener("keydown", onDown);
      target.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }

  release(): void {
    this.detach?.();
    this.detach = null;
    this.down.clear();
    this.pressed.clear();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  takePressed(): Set<string> {
    const out = this.pressed;
    this.pressed = new Set();
    return out;
  }
}
