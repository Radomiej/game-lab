// Port silnika z web-learning-lab (src/services/gameRuntime.js + shared/lab-game-v2).
// Tworzy instancję GameLab per uruchomienie na naszym canvasie; doc.querySelector
// '#game' mapujemy na canvas podglądu — run() montuje wtedy konsolę LAB·BOY
// (D-pad, ABXY, stats, boot) dokładnie jak w labach.
import { createGameLab, CONSOLE_STYLE, type GameLabApi, type LabEngineGame } from "./gameRuntime.js";
import { assetManifest } from "./assets/Assets.js";
import { userAssets, type UserAsset } from "../core/userAssets";

export { assetManifest };
export type { GameLabApi, LabEngineGame };

/** Styl konsoli LAB·BOY — wstrzykujemy od razu, bo shell stoi na stałe. */
export function ensureConsoleStyle(doc: Document = document): void {
  if (!doc.getElementById("lab-console-style")) {
    const style = doc.createElement("style");
    style.id = "lab-console-style";
    style.textContent = CONSOLE_STYLE;
    (doc.head || doc.body).append(style);
  }
}

/** Aktywna instancja silnika — user-assety rejestrują się w niej na żywo. */
let active: GameLabApi | null = null;

/** Bieżąca gra silnika (dla Scene View). */
export function getActiveGame(): LabEngineGame | null {
  return active?.current ?? null;
}

/** Całe API aktywnego silnika — most WorldRegistry i fasada lab.* używają
 *  go do materializacji GameObjectów/komponentów z innych języków. */
export function getActiveEngine(): GameLabApi | null {
  return active;
}

export function createLabEngine(canvas: HTMLCanvasElement): GameLabApi {
  const docShim = {
    querySelector: (sel: string) => (sel === "#game" ? canvas : document.querySelector(sel)),
    querySelectorAll: (sel: string) => document.querySelectorAll(sel),
    getElementById: (id: string) => document.getElementById(id),
    createElement: (tag: string) => document.createElement(tag),
    get head() {
      return document.head;
    },
    get body() {
      return document.body;
    },
    get activeElement() {
      return document.activeElement;
    },
  };
  const lab = createGameLab({
    window,
    document: docShim,
    // game.sound.playSound("plik.wav") — user audio z dropzone
    resolveSound: (name: string) => {
      const a = userAssets.get(name);
      return a?.kind === "audio" ? a.dataUrl : undefined;
    },
  });
  // User-tekstury przeżywają instancje silnika — rejestrujemy na nowo.
  for (const a of userAssets.list()) registerTexture(lab, a);
  active = lab;
  return lab;
}

export function labEngineDisposed(): void {
  active = null;
}

/** Rejestruje user-grafikę jako teksturę GameLab — Sprite("nazwa.png") działa. */
export function registerTexture(lab: GameLabApi, asset: UserAsset): void {
  if (asset.kind !== "image" || !asset.image) return;
  const source = `@user:${asset.name}`;
  if (!assetManifest.assets.some((a) => a.key === asset.key)) {
    assetManifest.assets.push({
      key: asset.key,
      constant: `USER_${asset.name.replace(/\W+/g, "_").toUpperCase()}`,
      source,
      frame: { x: 0, y: 0, w: asset.w ?? 0, h: asset.h ?? 0 },
      pivot: { x: 0.5, y: 0.5 },
      category: "user",
    });
  }
  lab.renderer.entries.set(asset.key, {
    key: asset.key,
    source,
    frame: { x: 0, y: 0, w: asset.w ?? 0, h: asset.h ?? 0 },
  });
  lab.renderer.images.set(source, asset.image);
}

export function unregisterTexture(lab: GameLabApi | null, key: string): void {
  const i = assetManifest.assets.findIndex((a) => a.key === key);
  if (i >= 0) assetManifest.assets.splice(i, 1);
  const entry = lab?.renderer.entries.get(key);
  if (entry) {
    lab?.renderer.entries.delete(key);
    lab?.renderer.images.delete(entry.source);
  }
}

/** Hot-register w działającym silniku (drop assetu w trakcie gry). */
export function registerAssetLive(asset: UserAsset): void {
  if (active) registerTexture(active, asset);
}
