// Deklaracje dla skopiowanego audio.js z web-learning-lab.

export interface LabAudioOut {
  playNote(note: string, opts?: { wave?: string; beats?: number; tempo?: number; volume?: number }): void;
  play(song: unknown, opts?: { loop?: boolean; volume?: number }): void;
  playSong(song: unknown, opts?: { loop?: boolean; volume?: number }): void;
  stop(): void;
  dispose(): void;
  resume(): void;
  bindGestures(target: EventTarget): void;
}

export interface LabAudioKit {
  createAudio(opts?: { window?: Window }): LabAudioOut;
}

export function createLabAudio(): LabAudioKit;
