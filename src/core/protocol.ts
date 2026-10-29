// Lab Runtime Protocol (LRP) — jedyny kontrakt między nakładką językową
// a hostem (konsola + canvas + input). Wzorzec: java-lab shared/lab-game-v2/contract.json.
//
// Nakładka językowa NIE rysuje i NIE pisze do DOM. Emituje wyłącznie
// zdarzenia tego protokołu przez LabHost. Dzięki temu renderer, konsola
// i warstwa kursowa są współdzielone przez wszystkie języki.

import type { WorldRegistry } from "./world";

export type DrawCmd =
  | { op: "clear"; color?: string }
  | { op: "rect"; x: number; y: number; w: number; h: number; color: string; fill?: boolean }
  | { op: "circle"; x: number; y: number; r: number; color: string; fill?: boolean }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width?: number }
  | { op: "text"; x: number; y: number; text: string; color: string; size?: number };

export interface RunRequest {
  files: Record<string, string>;
  entry: string;
  stdin?: string;
}

export type ExitStatus = "ok" | "compile-error" | "runtime-error" | "stopped";

export interface RunResult {
  status: ExitStatus;
  message?: string;
}

// To, co nakładka otrzymuje od hosta.
export interface LabHost {
  stdout(text: string): void;
  stderr(text: string): void;
  /** Linia ostrzeżenia (console.warn) — renderowana jak warn w labach. */
  warn(text: string): void;
  draw(cmds: DrawCmd[]): void;
  isKeyDown(code: string): boolean;
  /** Kody klawiszy wciśnięte od ostatniej klatki (konsumowane przy odczycie). */
  takePressed(): Set<string>;
  width(): number;
  height(): number;
  /** Kolejka stdin: zwraca następną linię albo null, gdy brak. */
  readStdinLine(): string | null;
  /**
   * Rejestracja pętli gry. Nakładka wywołuje to, gdy kod ucznia
   * zdefiniował init()/update(dt). Host sam odpala klatki.
   * Zwraca Promise kończący się przy STOP albo błędzie klatki.
   */
  startGameLoop(update: (dt: number) => void | Promise<void>, init?: () => void | Promise<void>): Promise<void>;
  /** Rejestr świata — interop GameObject/Component między językami. */
  world(): WorldRegistry;
}

// To, co UI widzi jako jedną nakładkę językową.
export interface LabRuntime {
  id: string;
  label: string;
  extensions: string[];
  /** Lenie ładowanie ciężkich runtime (clang.wasm, pyodide). */
  load?(onProgress: (msg: string) => void): Promise<void>;
  run(req: RunRequest, host: LabHost): Promise<RunResult>;
  stop(): void;
}
