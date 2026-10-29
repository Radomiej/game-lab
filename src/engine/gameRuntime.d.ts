// Deklaracje dla skopiowanego silnika z web-learning-lab (gameRuntime.js).
// Silnik jest JS — trzymamy go 1:1, typy tylko dla konsumentów TS.
export interface LabEngineRenderer {
  entries: Map<string, { key: string; source: string; frame: { x: number; y: number; w: number; h: number } }>;
  images: Map<string, CanvasImageSource>;
}

export interface LabEngineGame {
  pause(): void;
  resume(): void;
  isPaused?: boolean;
  disposed?: boolean;
  objects: unknown[];
  input: unknown;
  [k: string]: unknown;
}

export interface GameLabApi {
  renderer: LabEngineRenderer;
  run(GameClass: unknown, config?: { canvas?: string | HTMLCanvasElement; [k: string]: unknown }): LabEngineGame;
  dispose(): void;
  readonly current: LabEngineGame | null;
  assetsReady: Promise<void>;
  snapshot(): unknown;
  evaluateScenario(scenario: unknown): unknown;
  Assets: Record<string, string>;
  Keys: Record<string, string>;
  Game: new () => unknown;
  GameObject: new (...a: unknown[]) => unknown;
  Component: new (...a: unknown[]) => unknown;
  Transform: new (...a: unknown[]) => unknown;
  Sprite: new (texture?: string, width?: number, height?: number) => unknown;
  ShapeRenderer: new (...a: unknown[]) => unknown;
  TextRenderer: new (text?: unknown, fontSize?: number, color?: string) => unknown;
  TopDownCharacterController2D: new () => unknown;
  PlatformerCharacterController2D: new () => unknown;
  Camera2D: new (...a: unknown[]) => unknown;
  TileMap: new (...a: unknown[]) => unknown;
  [k: string]: unknown;
}

export function createGameLab(environment?: Record<string, unknown>, shared?: Record<string, unknown>): GameLabApi;
export function getGameRuntimeScript(): string;
export const CONSOLE_STYLE: string;
