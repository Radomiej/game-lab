// World Registry — serce interopu. GameObject i Component są liczbami
// (handle); właścicielem logiki jest runtime, który komponent zarejestrował.
// Wszystkie języki widzą te same obiekty: publiczne pola przez get/set,
// publiczne metody przez invoke — marshaling przez host (hub-and-spoke).
//
// Dla runtime w jednym wątku (JS/TS/Lua/Py) invoke jest synchroniczny.
// Dla WASM (C++/Java) tę samą ścieżkę obsłuży eksport WASM wywołany
// przez host — interfejs się nie zmienia.

export type Primitive = null | boolean | number | string;

// Mostek, który nakładka językowa dostarcza przy rejestracji komponentu.
export interface ComponentBridge {
  get(name: string): unknown;
  set(name: string, value: unknown): void;
  invoke(method: string, args: unknown[]): unknown;
  /** Opcjonalnie: publiczne składowe komponentu (do inspektora hierarchii). */
  listMembers?(): MemberInfo[];
}

export interface MemberInfo {
  name: string;
  kind: "prop" | "method";
}

export interface RegisteredComponent {
  id: number;
  objectId: number;
  kind: string;
  lang: string;
  bridge: ComponentBridge;
}

/** Węzeł hierarchii sceny — GameObject z jego komponentami (jak Unity). */
export interface SceneObject {
  id: number;
  name: string;
  comps: RegisteredComponent[];
}

export class WorldRegistry {
  private nextObjectId = 1;
  private nextCompId = 1;
  private components = new Map<number, RegisteredComponent>();
  private objectComps = new Map<number, Set<number>>();
  private objectNames = new Map<number, string>();

  spawnObject(name?: string): number {
    const id = this.nextObjectId++;
    this.objectNames.set(id, name ?? `GameObject ${id}`);
    this.objectComps.set(id, new Set());
    return id;
  }

  objectName(id: number): string {
    return this.objectNames.get(id) ?? `obj ${id}`;
  }

  attach(objectId: number, kind: string, lang: string, bridge: ComponentBridge): number {
    if (!this.objectComps.has(objectId)) this.objectComps.set(objectId, new Set());
    const id = this.nextCompId++;
    this.components.set(id, { id, objectId, kind, lang, bridge });
    this.objectComps.get(objectId)!.add(id);
    return id;
  }

  component(id: number): RegisteredComponent | undefined {
    return this.components.get(id);
  }

  /** pierwszy komponent danego typu na obiekcie */
  findOnObject(objectId: number, kind: string): number | undefined {
    for (const cid of this.objectComps.get(objectId) ?? []) {
      if (this.components.get(cid)?.kind === kind) return cid;
    }
    return undefined;
  }

  /** pierwszy komponent danego typu w całym świecie */
  find(kind: string): number | undefined {
    for (const c of this.components.values()) if (c.kind === kind) return c.id;
    return undefined;
  }

  get(compId: number, prop: string): unknown {
    return this.components.get(compId)?.bridge.get(prop);
  }

  set(compId: number, prop: string, value: unknown): void {
    this.components.get(compId)?.bridge.set(prop, value);
  }

  call(compId: number, method: string, args: unknown[] = []): unknown {
    return this.components.get(compId)?.bridge.invoke(method, args);
  }

  /** Tickuje update(dt) na wszystkich komponentach — woła host raz na klatkę.
   *  invoke może zwracać Promise (runtime z async FFI, np. część silników WASM). */
  async tick(dt: number, onError: (comp: RegisteredComponent, err: unknown) => void): Promise<void> {
    for (const c of this.components.values()) {
      try {
        await c.bridge.invoke("update", [dt]);
      } catch (err) {
        onError(c, err);
      }
    }
  }

  destroyObject(objectId: number): void {
    for (const cid of this.objectComps.get(objectId) ?? []) this.components.delete(cid);
    this.objectComps.delete(objectId);
    this.objectNames.delete(objectId);
  }

  clear(): void {
    this.components.clear();
    this.objectComps.clear();
    this.objectNames.clear();
  }

  describe(): RegisteredComponent[] {
    return [...this.components.values()];
  }

  /** Hierarchia sceny: GameObject → komponenty (kolejność = kolejność spawnów). */
  describeScene(): SceneObject[] {
    const scene: SceneObject[] = [];
    for (const [id, cids] of this.objectComps) {
      const comps = [...cids]
        .map((cid) => this.components.get(cid))
        .filter((c): c is RegisteredComponent => c !== undefined);
      scene.push({ id, name: this.objectName(id), comps });
    }
    return scene;
  }
}
