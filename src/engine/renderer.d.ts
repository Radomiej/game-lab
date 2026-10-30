// Deklaracje dla skopiowanego renderer.js z web-learning-lab.
// Format komend = protokół rysowania silnika (i Java TeaVM game-draw).

export interface LabAssetEntry {
  key: string;
  source: string;
  frame: { x: number; y: number; w: number; h: number };
  ninePatch?: { left: number; top: number; right: number; bottom: number };
  barInset?: { left: number; top: number; right: number; bottom: number };
  pivot?: { x: number; y: number };
  constant?: string;
  category?: string;
}

export interface LabAssetManifest {
  assets: LabAssetEntry[];
}

export type DrawCommand = Record<string, unknown> & { op?: string };

export interface LabRenderer {
  entries: Map<string, LabAssetEntry>;
  images: Map<string, CanvasImageSource>;
  load(win: Window, base?: string): Promise<void>;
  draw(ctx: CanvasRenderingContext2D, command: DrawCommand): void;
  drawSprite(ctx: CanvasRenderingContext2D, command: DrawCommand, clip?: number): void;
  drawNinePatch(ctx: CanvasRenderingContext2D, command: DrawCommand): void;
  drawProgress(ctx: CanvasRenderingContext2D, command: DrawCommand): void;
}

export function createRenderer(manifest: LabAssetManifest): LabRenderer;
