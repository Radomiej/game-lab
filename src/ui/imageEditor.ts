// Edytor pikseli dla plików .png projektu — treść pliku = dataURL PNG.
// Zapis: canvas → dataURL → plik + rejestracja tekstury (Sprite("nazwa.png")).
const PALETTE = [
  "#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
  "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa",
];

export class ImageEditor {
  private name = "";
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private color = PALETTE[0];
  private erasing = false;
  private dirty = false;
  private saveTimer: number | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly onSave: (name: string, text: string) => void,
    private readonly onImage: (name: string, dataUrl: string) => void,
  ) {
    this.el.classList.add("image-editor");
    this.ctx.imageSmoothingEnabled = false;
  }

  open(name: string, text: string): void {
    this.name = name;
    this.dirty = false;
    const img = new Image();
    img.onload = () => {
      this.canvas.width = img.naturalWidth;
      this.canvas.height = img.naturalHeight;
      this.ctx.drawImage(img, 0, 0);
      this.render();
    };
    img.onerror = () => {
      this.canvas.width = this.canvas.height = 16;
      this.ctx.clearRect(0, 0, 16, 16);
      this.render();
    };
    img.src = text.trim() || transparentPng(16);
  }

  private queueSave(): void {
    this.dirty = true;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      const url = this.canvas.toDataURL("image/png");
      this.onSave(this.name, url);
      this.onImage(this.name, url);
      this.dirty = false;
    }, 350);
  }

  private render(): void {
    this.el.replaceChildren();
    const head = document.createElement("div");
    head.className = "se-head";
    head.innerHTML = `<span class="se-title">Piksele — ${this.name} (${this.canvas.width}×${this.canvas.height})</span>`;

    const clear = document.createElement("button");
    clear.className = "se-btn";
    clear.textContent = "Wyczyść";
    clear.onclick = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.repaint();
      this.queueSave();
    };
    head.appendChild(clear);

    const hint = document.createElement("span");
    hint.className = "se-hint";
    hint.textContent = `new GameLab.Sprite("${this.name}", ${this.canvas.width}, ${this.canvas.height})`;
    head.appendChild(hint);
    this.el.appendChild(head);

    const body = document.createElement("div");
    body.className = "px-body";

    const pal = document.createElement("div");
    pal.className = "px-pal";
    for (const c of PALETTE) {
      const b = document.createElement("button");
      b.className = "px-color";
      b.style.background = c;
      b.title = c;
      b.setAttribute("aria-label", `Kolor ${c}`);
      if (!this.erasing && c === this.color) b.classList.add("sel");
      b.onclick = () => {
        this.color = c;
        this.erasing = false;
        this.render();
      };
      pal.appendChild(b);
    }
    const er = document.createElement("button");
    er.className = "px-color px-erase";
    er.textContent = "⌫";
    er.title = "Gumka (przezroczyste)";
    er.setAttribute("aria-label", "Gumka");
    if (this.erasing) er.classList.add("sel");
    er.onclick = () => {
      this.erasing = true;
      this.render();
    };
    pal.appendChild(er);
    body.appendChild(pal);

    const view = document.createElement("canvas");
    view.className = "px-view";
    const scale = Math.max(4, Math.floor(360 / Math.max(this.canvas.width, this.canvas.height)));
    view.width = this.canvas.width * scale;
    view.height = this.canvas.height * scale;
    const vctx = view.getContext("2d")!;
    vctx.imageSmoothingEnabled = false;

    const paint = (e: PointerEvent) => {
      const r = view.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * this.canvas.width);
      const y = Math.floor(((e.clientY - r.top) / r.height) * this.canvas.height);
      if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return;
      if (this.erasing) this.ctx.clearRect(x, y, 1, 1);
      else {
        this.ctx.fillStyle = this.color;
        this.ctx.fillRect(x, y, 1, 1);
      }
      this.repaint();
      this.queueSave();
    };
    let drawing = false;
    view.addEventListener("pointerdown", (e) => {
      drawing = true;
      view.setPointerCapture(e.pointerId);
      paint(e);
    });
    view.addEventListener("pointermove", (e) => drawing && paint(e));
    view.addEventListener("pointerup", () => (drawing = false));
    view.addEventListener("pointercancel", () => (drawing = false));
    this._view = view;
    this._vctx = vctx;
    body.appendChild(view);
    this.el.appendChild(body);
    this.repaint();
  }

  private _view: HTMLCanvasElement | null = null;
  private _vctx: CanvasRenderingContext2D | null = null;

  private repaint(): void {
    if (!this._view || !this._vctx) return;
    const v = this._vctx;
    const scale = this._view.width / this.canvas.width;
    // szachownica pod przezroczystość
    v.clearRect(0, 0, this._view.width, this._view.height);
    const cell = Math.max(4, scale * 2);
    for (let y = 0; y < this._view.height / cell; y++) {
      for (let x = 0; x < this._view.width / cell; x++) {
        v.fillStyle = (x + y) % 2 ? "#20242c" : "#2a2f3a";
        v.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    v.imageSmoothingEnabled = false;
    v.drawImage(this.canvas, 0, 0, this._view.width, this._view.height);
    // siatka pikseli
    if (scale >= 8) {
      v.strokeStyle = "#ffffff14";
      v.lineWidth = 1;
      v.beginPath();
      for (let x = 0; x <= this.canvas.width; x++) {
        v.moveTo(x * scale + 0.5, 0);
        v.lineTo(x * scale + 0.5, this._view.height);
      }
      for (let y = 0; y <= this.canvas.height; y++) {
        v.moveTo(0, y * scale + 0.5);
        v.lineTo(this._view.width, y * scale + 0.5);
      }
      v.stroke();
    }
  }
}

/** Pusty przezroczysty PNG NxN jako dataURL (nowy plik obrazu). */
export function transparentPng(size = 16): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c.toDataURL("image/png");
}
