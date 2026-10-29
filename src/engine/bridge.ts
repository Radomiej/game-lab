// Most WorldRegistry ↔ GameLab: obiekty i komponenty zapisane przez
// DOWOLNY język (lab.spawn / lab.attachComponent) materializują się jako
// prawdziwe GameObject/Component silnika — z transformem, rendererem
// i update(dt) wołanym w fazie update silnika, tak samo jak natywne
// komponenty JS. Tick lokalny (world.tick w hoście) pomija komponenty
// zmostkowane, gdy silnik żyje — unikamy podwójnego ticku.
import { createLabEngine, getActiveEngine } from "./index";
import type { GameLabApi } from "./gameRuntime.js";
import type { LabHost } from "../core/protocol";
import type { RegisteredComponent } from "../core/world";

type TransformLike = { x: number; y: number; rotation: number; scale: { x: number; y: number } };
type GameObjectLike = {
  name: string;
  transform: TransformLike;
  addComponent(c: unknown): unknown;
  destroy(): void;
};

// transform przechowywany też dla obiektów bez żywego GameObject —
// po materializacji (np. silnik wstał później) wartości się przenoszą.
type TransformStore = { x: number; y: number; rotation: number; scaleX: number; scaleY: number };

const bound = new Map<number, GameObjectLike>();
const transforms = new Map<number, TransformStore>();
// renderery pamiętane per obiekt — przy rebindzie (nowa gra) dokładamy je znowu
const rendererSpecs = new Map<number, RendererSpec[]>();
let boundGame: unknown = null;
let errSink: (msg: string) => void = () => {};

function gameOf(api: GameLabApi | null): { createObject(name: string): GameObjectLike } | null {
  const g = api?.current as { createObject?(name: string): GameObjectLike } | null;
  return g?.createObject ? (g as { createObject(name: string): GameObjectLike }) : null;
}

function applyStore(id: number, obj: GameObjectLike): void {
  const t = transforms.get(id);
  if (!t) return;
  obj.transform.x = t.x;
  obj.transform.y = t.y;
  obj.transform.rotation = t.rotation;
  obj.transform.scale.x = t.scaleX;
  obj.transform.scale.y = t.scaleY;
}

// Zmaterializuj świat rejestru w bieżącej grze — przy rebindzie po
// GameLab.run() (poprzednia gra zniszczyła nasze GameObjecty).
// Woływane też z runtime'ów po starcie gry użytkownika.
export function bindWorld(host: LabHost, api: GameLabApi): void {
  const game = gameOf(api);
  if (!game || boundGame === api.current) return;
  bound.clear();
  boundGame = api.current;
  errSink = (m) => host.stderr(m);
  for (const so of host.world().describeScene()) {
    const obj = game.createObject(so.name);
    bound.set(so.id, obj);
    applyStore(so.id, obj);
    for (const spec of rendererSpecs.get(so.id) ?? []) obj.addComponent(makeRenderer(api, spec));
    for (const c of so.comps) attachEngine(api, c);
  }
}

function makeRenderer(api: GameLabApi, spec: RendererSpec): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const A = api as any;
  let r: Record<string, unknown>;
  switch (spec.type ?? "sprite") {
    case "rect":
      r = new A.ShapeRenderer(spec.width ?? 32, spec.height ?? 32, spec.color ?? "#76b9f2");
      (r as { shape: string }).shape = "rect";
      break;
    case "circle":
      r = A.ShapeRenderer.circle(spec.radius ?? 16, spec.color ?? "#76b9f2");
      break;
    case "text":
      r = new A.TextRenderer(spec.text ?? "", spec.fontSize ?? 16, spec.color ?? "#ffffff");
      break;
    default:
      r = new A.Sprite(spec.texture ?? "player", spec.width ?? 32, spec.height ?? 32);
  }
  if (spec.layer !== undefined) r.layer = spec.layer;
  if (spec.order !== undefined) r.order = spec.order;
  if (spec.space !== undefined) r.space = spec.space;
  return r;
}

function tryInvoke(comp: RegisteredComponent, method: string, args: unknown[]): void {
  try {
    comp.bridge.invoke(method, args);
  } catch (err) {
    errSink(`\n[${comp.lang}:${comp.kind}] ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

// x/y komponentu zsynchronizowane z transformem GameObjectu — wystarczy,
// że komponent ustawia swoje pola, a obiekt jeździ po scenie.
function syncXY(comp: RegisteredComponent, obj: GameObjectLike): void {
  try {
    const x = comp.bridge.get("x");
    const y = comp.bridge.get("y");
    const t = transforms.get(comp.objectId) ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    if (typeof x === "number") {
      obj.transform.x = x;
      t.x = x;
    }
    if (typeof y === "number") {
      obj.transform.y = y;
      t.y = y;
    }
    transforms.set(comp.objectId, t);
  } catch {
    /* bridge.get opcjonalny */
  }
}

// Component silnika delegujący cykl życia do bridge komponentu rejestru.
// update(dt) leci przez ten sam kanał co natywne komponenty — faza WORLD.
function attachEngine(api: GameLabApi, comp: RegisteredComponent): void {
  const obj = bound.get(comp.objectId);
  if (!obj) return;
  const cls = class extends (api.Component as unknown as new () => object) {
    onCreate() {
      tryInvoke(comp, "onCreate", [comp.objectId]);
      tryInvoke(comp, "create", [comp.objectId]);
      syncXY(comp, obj);
    }
    onUpdate(dt: number) {
      tryInvoke(comp, "update", [dt]);
      syncXY(comp, obj);
    }
    onLateUpdate(dt: number) {
      tryInvoke(comp, "lateUpdate", [dt]);
    }
    onDestroy() {
      tryInvoke(comp, "onDestroy", []);
      tryInvoke(comp, "destroy", []);
    }
  };
  // nazwa w snapshot/hierarchii = rodzaj komponentu (np. "Chaser")
  Object.defineProperty(cls, "name", { value: comp.kind });
  obj.addComponent(new cls());
  comp.engineDriven = true;
}

/**
 * Silnik dla obiektów/komponentów z rejestru. Jeśli gra już działa —
 * używa jej; jeśli nie — bootuje BridgeGame (pusta scena-host),
 * więc kod w dowolnym języku odpala "prawdziwą" grę GameLab.
 */
export function ensureEngine(host: LabHost): GameLabApi | null {
  let api = getActiveEngine();
  if (!api) {
    if (!host.canvasEl) return null;
    api = createLabEngine(host.canvasEl);
  }
  if (!api.current) {
    const BridgeGame = class extends (api.Game as unknown as new () => object) {};
    Object.defineProperty(BridgeGame, "name", { value: "BridgeGame" });
    api.run(BridgeGame, {});
  }
  bindWorld(host, api);
  return api;
}

// --- wejścia z fasady lab.* ---

export function bridgeSpawn(host: LabHost, id: number, name: string): void {
  const api = getActiveEngine();
  const game = gameOf(api);
  if (!api || !game) return;
  bindWorld(host, api);
  const obj = game.createObject(name);
  bound.set(id, obj);
  applyStore(id, obj);
}

export function bridgeAttachComponent(host: LabHost, comp: RegisteredComponent): void {
  const api = getActiveEngine();
  if (!api?.current) return;
  bindWorld(host, api);
  attachEngine(api, comp);
}

export interface RendererSpec {
  type?: "sprite" | "rect" | "circle" | "text";
  texture?: string;
  width?: number;
  height?: number;
  radius?: number;
  color?: string;
  text?: string;
  fontSize?: number;
  layer?: number;
  order?: number;
  space?: "world" | "screen";
}

export function bridgeAttachRenderer(host: LabHost, objectId: number, spec: RendererSpec): boolean {
  const api = ensureEngine(host);
  if (!api) return false;
  const specs = rendererSpecs.get(objectId) ?? [];
  specs.push(spec);
  rendererSpecs.set(objectId, specs);
  const obj = bound.get(objectId);
  if (!obj) return true; // zmaterializuje się przy bindWorld
  obj.addComponent(makeRenderer(api, spec));
  return true;
}

export function bridgeSetTransform(
  objectId: number,
  t: { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number },
): void {
  const cur = transforms.get(objectId) ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const next = { ...cur, ...t };
  transforms.set(objectId, next);
  const obj = bound.get(objectId);
  if (!obj) return;
  if (t.x !== undefined) obj.transform.x = t.x;
  if (t.y !== undefined) obj.transform.y = t.y;
  if (t.rotation !== undefined) obj.transform.rotation = t.rotation;
  if (t.scaleX !== undefined) obj.transform.scale.x = t.scaleX;
  if (t.scaleY !== undefined) obj.transform.scale.y = t.scaleY;
}

export function bridgeGetTransform(objectId: number): TransformStore | null {
  const obj = bound.get(objectId);
  if (obj) {
    return {
      x: obj.transform.x,
      y: obj.transform.y,
      rotation: obj.transform.rotation,
      scaleX: obj.transform.scale.x,
      scaleY: obj.transform.scale.y,
    };
  }
  return transforms.get(objectId) ?? null;
}

export function bridgeDestroyObject(objectId: number): void {
  bound.get(objectId)?.destroy();
  bound.delete(objectId);
  transforms.delete(objectId);
  rendererSpecs.delete(objectId);
}
