import { DomLabHost, setEvalFileHook } from "./core/host";
import { RuntimeConsole } from "./ui/console";
import { ProjectPanel, NEW_FILE_LANGS } from "./ui/project";
import { SceneView } from "./ui/sceneView";
import { runtimes } from "./runtimes";
import { examples } from "./examples";
import {
  assetManifest,
  ensureConsoleStyle,
  getActiveEngine,
  getActiveGame,
  labEngineDisposed,
  registerAssetLive,
  setProjectFileSource,
  unregisterTexture,
} from "./engine/index";
import { addUserFile, userAssets, isImageAsset, type UserAsset } from "./core/userAssets";
import { CodeEditor } from "./ui/codeEditor";
import { SoundEditor } from "./ui/soundEditor";
import { ImageEditor, transparentPng } from "./ui/imageEditor";
import type { AssetEntry } from "./engine/assets/Assets.js";
import { buildOrbitPackage } from "./orbit-export";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const runBtn = $<HTMLButtonElement>("#run");
const orbitExportBtn = $<HTMLButtonElement>("#orbit-export");
const stopBtn = $<HTMLButtonElement>("#stop");
const clearAllBtn = $<HTMLButtonElement>("#clear-all");
const settingsBtn = $<HTMLButtonElement>("#settings-btn");
const consoleEl = $("#console");
const pillEl = $("#status-pill");
const stdinEl = $<HTMLInputElement>("#stdin");
const canvas = $<HTMLCanvasElement>("#canvas");
const emuIdle = $<HTMLElement>("#emu-idle");
const pauseBtn = $<HTMLButtonElement>("#pause");
const restartBtn = $<HTMLButtonElement>("#restart");
const fpsEl = $("#fps");
const consoleToggle = $<HTMLButtonElement>("#console-toggle");
const consoleSection = document.querySelector(".runtime-console") as HTMLElement;
const projectEl = $<HTMLElement>("#project");
const copyBtn = $<HTMLButtonElement>("#cc-copy");
const wsBtn = $<HTMLButtonElement>("#cc-ws");
const ccClearBtn = $<HTMLButtonElement>("#cc-clear");
const copyStatus = $("#copy-status");
const editorHostEl = $<HTMLElement>("#editor");
const viewTabsEl = $("#view-tabs");
const viewRoot = $<HTMLElement>("#view-root");
const sceneCanvas = $<HTMLCanvasElement>("#scene-view");
const worldListEl = $("#world-list");
const worldCountEl = $("#world-count");
const settingsModal = $<HTMLDialogElement>("#settings-modal");
const setEntrySel = $<HTMLSelectElement>("#set-entry");
const setMethodInput = $<HTMLInputElement>("#set-method");
const emuStage = $<HTMLElement>("#emu-stage");
const labConsoleEl = document.querySelector(".view-emulator .lab-console") as HTMLElement;
const labShellEl = document.querySelector(".view-emulator .lab-console-shell") as HTMLElement;
const zoomOutBtn = $<HTMLButtonElement>("#zoom-out");
const zoomInBtn = $<HTMLButtonElement>("#zoom-in");
const zoomFitBtn = $<HTMLButtonElement>("#zoom-fit");
const zoomLabel = $("#zoom-label");

const term = new RuntimeConsole(consoleEl, pillEl);
const host = new DomLabHost(term, canvas);
const editor = new CodeEditor(editorHostEl);
if (import.meta.env.DEV) {
  const w = window as unknown as { __editor: CodeEditor; __lab: unknown };
  w.__editor = editor;
  w.__lab = { host, getActiveEngine, getActiveGame, userAssets };
}
let currentFiles: Record<string, string> = {};
const currentFolders = new Set<string>();

/** Zapis treści pliku z edytorów specjalistycznych (sound/image). */
function saveFileText(name: string, text: string): void {
  currentFiles[name] = text;
}

const soundEd = new SoundEditor($("#sound-editor"), saveFileText);
const imageEd = new ImageEditor($("#image-editor"), saveFileText, (name, dataUrl) => {
  void registerProjectImage(name, dataUrl);
});

setProjectFileSource((name) => currentFiles[name]);

/** Plik .png w projekcie → tekstura GameLab (Sprite("nazwa.png")). */
async function registerProjectImage(name: string, dataUrl: string): Promise<void> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("nie można zdekodować PNG"));
    img.src = dataUrl;
  });
  const asset: UserAsset = { key: name, name, kind: "image", dataUrl, image: img, w: img.naturalWidth, h: img.naturalHeight };
  userAssets.put(asset);
  registerAssetLive(asset);
  renderProject();
}
let openFile = "main.js";
let running = false;
let wantRestart = false;

// ---- ustawienia projektu (plik startowy + metoda startowa) ----
interface Settings {
  entry: string;
  method: string;
}
let settings: Settings = { entry: "main.js", method: "" };
try {
  const saved = JSON.parse(localStorage.getItem("lab-core-settings") ?? "null");
  if (saved?.entry) settings = { entry: saved.entry, method: saved.method ?? "" };
} catch {
  /* brak localStorage — ok */
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

// ---- zakładki widoków w centrum (jak w IDE do gier) ----
// file:<nazwa> — edytor pliku · asset:<klucz> — podgląd assetu ·
// emulator / scene / sounds — przypięte widoki silnika.
type ViewId = string;
const PINNED_VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: "emulator", label: "Emulator" },
  { id: "scene", label: "Scena" },
  { id: "sounds", label: "Dźwięki" },
];
let openAssets: string[] = [];
let activeView: ViewId = `file:${openFile}`;

function syncEditorToFile(name: string): void {
  editor.open(name, currentFiles[name] ?? "");
}

function renderViewTabs(): void {
  viewTabsEl.innerHTML = "";
  const mk = (id: ViewId, label: string, title?: string, closable = false) => {
    const b = document.createElement("button");
    b.className = "view-tab";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(activeView === id));
    if (activeView === id) b.classList.add("active");
    if (title) b.title = title;
    b.textContent = label;
    if (closable) {
      const x = document.createElement("span");
      x.className = "vt-close";
      x.textContent = "×";
      x.setAttribute("aria-hidden", "true");
      x.onclick = (e) => {
        e.stopPropagation();
        openAssets = openAssets.filter((k) => k !== id.slice(6));
        if (activeView === id) activate(`file:${openFile}`);
        else renderViewTabs();
      };
      b.appendChild(x);
    }
    b.onclick = () => activate(id);
    viewTabsEl.appendChild(b);
  };
  for (const name of Object.keys(currentFiles)) {
    mk(`file:${name}`, name, name === settings.entry ? `${name} — plik startowy` : name);
    const t = viewTabsEl.lastElementChild as HTMLElement;
    if (name === settings.entry) t.classList.add("entry");
  }
  for (const key of openAssets) mk(`asset:${key}`, `◆ ${key}`, `Podgląd assetu ${key}`, true);
  const sep = document.createElement("span");
  sep.className = "vt-sep";
  sep.setAttribute("aria-hidden", "true");
  viewTabsEl.appendChild(sep);
  for (const v of PINNED_VIEWS) mk(v.id, v.label, v.label);
}

function viewKindForFile(name: string): string {
  if (/\.(sfx|song)$/i.test(name)) return "soundedit";
  if (isImageAsset(name)) return "imageedit";
  return "files";
}

function activate(id: ViewId): void {
  if (activeView.startsWith("file:") && viewKindForFile(openFile) === "files") currentFiles[openFile] = editor.value;
  activeView = id;
  renderViewTabs();
  const kind = id.startsWith("file:") ? viewKindForFile(id.slice(5)) : id.startsWith("asset:") ? "asset" : id;
  for (const v of viewRoot.querySelectorAll<HTMLElement>(".view")) v.hidden = v.dataset.view !== kind;
  if (kind === "files") {
    const name = id.slice(5);
    if (name !== openFile) {
      openFile = name;
      syncEditorToFile(name);
    }
    renderProject();
    editor.focus();
  } else if (kind === "soundedit") {
    soundEd.open(id.slice(5), currentFiles[id.slice(5)] ?? "");
    renderProject();
  } else if (kind === "imageedit") {
    imageEd.open(id.slice(5), currentFiles[id.slice(5)] ?? "");
    renderProject();
  } else if (kind === "asset") {
    renderAssetView(id.slice(6));
  } else if (kind === "scene") {
    sceneView.show();
  } else if (kind === "sounds") {
    renderSoundsView();
  }
  if (kind === "emulator") fitEmulator();
  if (kind !== "scene") sceneView.hide();
}

const sceneView = new SceneView(sceneCanvas, () => getActiveGame());

// ---- podgląd assetu w centrum ----
function renderAssetView(key: string): void {
  const view = viewRoot.querySelector<HTMLElement>('[data-view="asset"]')!;
  view.replaceChildren();
  const entry = assetManifest.assets.find((a) => a.key === key);
  const ua = userAssets.get(key);
  const head = document.createElement("div");
  head.className = "asset-head";
  const title = document.createElement("h2");
  title.className = "view-title";
  title.textContent = key;
  head.appendChild(title);
  const insert = document.createElement("button");
  insert.className = "btn btn-mini";
  insert.textContent = "Wstaw Sprite do kodu";
  insert.onclick = () => {
    const w = entry?.frame.w ?? ua?.w ?? 48;
    const h = entry?.frame.h ?? ua?.h ?? 48;
    insertAtCursor(`new GameLab.Sprite(${JSON.stringify(key)}, ${w}, ${h})`);
  };
  head.appendChild(insert);
  view.appendChild(head);

  const stage = document.createElement("div");
  stage.className = "asset-stage";
  const meta = document.createElement("div");
  meta.className = "asset-meta";
  if (entry) {
    const c = document.createElement("canvas");
    const scale = Math.min(6, Math.max(2, Math.floor(160 / Math.max(entry.frame.w, entry.frame.h))));
    c.width = entry.frame.w * scale;
    c.height = entry.frame.h * scale;
    c.className = "asset-preview";
    const paint = () => {
      const img = new Image();
      img.onload = () => {
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, entry.frame.x, entry.frame.y, entry.frame.w, entry.frame.h, 0, 0, c.width, c.height);
      };
      img.src = `/game-assets/${entry.source}`;
    };
    paint();
    stage.appendChild(c);
    meta.innerHTML = `<dt>klucz</dt><dd>${entry.key}</dd><dt>klatka</dt><dd>${entry.frame.w}×${entry.frame.h}</dd><dt>kategoria</dt><dd>${entry.category ?? "—"}</dd><dt>atlas</dt><dd>${entry.source}</dd>`;
  } else if (ua?.kind === "image" && ua.image) {
    const img = document.createElement("img");
    img.src = ua.dataUrl;
    img.className = "asset-preview img";
    img.alt = ua.name;
    stage.appendChild(img);
    meta.innerHTML = `<dt>plik</dt><dd>${ua.name}</dd><dt>tekstura</dt><dd>${ua.w}×${ua.h}</dd><dt>kod</dt><dd>new GameLab.Sprite("${ua.name}", w, h)</dd>`;
  } else if (ua) {
    meta.innerHTML = `<dt>plik</dt><dd>${ua.name}</dd><dt>typ</dt><dd>${ua.kind}</dd>`;
  } else {
    meta.innerHTML = `<dd>nie znaleziono assetu</dd>`;
  }
  view.append(stage, meta);
}

// ---- widok Dźwięki w centrum ----
function renderSoundsView(): void {
  const view = viewRoot.querySelector<HTMLElement>('[data-view="sounds"]')!;
  view.replaceChildren();
  const head = document.createElement("div");
  head.className = "asset-head";
  const title = document.createElement("h2");
  title.className = "view-title";
  title.textContent = "Dźwięki";
  head.appendChild(title);
  view.appendChild(head);

  const sec1 = document.createElement("div");
  sec1.className = "project-section";
  sec1.textContent = "Syntezator — this.audio.playNote(…)";
  view.appendChild(sec1);
  const notes = document.createElement("div");
  notes.className = "sound-grid big";
  for (const n of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "E5", "G5", "A5", "C6"]) {
    const b = document.createElement("button");
    b.className = "sound-chip";
    b.textContent = n;
    b.title = `odsłuch ${n}`;
    b.onclick = () => previewNote(n);
    const ins = document.createElement("span");
    ins.className = "chip-insert";
    ins.textContent = "⤵";
    ins.title = `wstaw this.audio.playNote("${n}")`;
    ins.onclick = (e) => {
      e.stopPropagation();
      insertAtCursor(`this.audio.playNote(${JSON.stringify(n)})`);
    };
    b.appendChild(ins);
    notes.appendChild(b);
  }
  view.appendChild(notes);

  const sec2 = document.createElement("div");
  sec2.className = "project-section";
  sec2.textContent = "Moje dźwięki — this.sound.playSound(…)";
  view.appendChild(sec2);
  const audio = userAssets.list().filter((a) => a.kind === "audio");
  if (!audio.length) {
    const p = document.createElement("p");
    p.className = "world-empty";
    p.textContent = "przeciągnij mp3/wav/ogg do zakładki Dźwięki w panelu";
    view.appendChild(p);
  }
  const ul = document.createElement("ul");
  ul.className = "pj-list sound-list";
  for (const a of audio) {
    const li = document.createElement("li");
    li.className = "pj-row";
    const btn = document.createElement("button");
    btn.className = "pj-name";
    btn.title = `odsłuch ${a.name}`;
    btn.onclick = () => previewAudio(a);
    const nm = document.createElement("span");
    nm.className = "pj-label";
    nm.textContent = `♪ ${a.name}`;
    btn.appendChild(nm);
    li.appendChild(btn);
    const actions = document.createElement("span");
    actions.className = "pj-actions";
    const ins = document.createElement("button");
    ins.className = "pj-action";
    ins.title = `wstaw this.sound.playSound("${a.name}")`;
    ins.setAttribute("aria-label", `Wstaw odtwarzanie: ${a.name}`);
    ins.textContent = "⤵";
    ins.onclick = (e) => {
      e.stopPropagation();
      insertAtCursor(`this.sound.playSound(${JSON.stringify(a.name)})`);
    };
    const del = document.createElement("button");
    del.className = "pj-action";
    del.title = "Usuń dźwięk";
    del.setAttribute("aria-label", `Usuń dźwięk: ${a.name}`);
    del.textContent = "×";
    del.onclick = (e) => {
      e.stopPropagation();
      userAssets.remove(a.key);
      renderProject();
      renderSoundsView();
    };
    actions.append(ins, del);
    li.appendChild(actions);
    ul.appendChild(li);
  }
  view.appendChild(ul);
}

// ---- podgląd dźwięku ----
let previewEl: HTMLAudioElement | null = null;
let toneCtx: AudioContext | null = null;
function previewAudio(a: UserAsset): void {
  if (previewEl && previewEl.dataset.key === a.key && !previewEl.paused) {
    previewEl.pause();
    previewEl.currentTime = 0;
    return;
  }
  previewEl?.pause();
  previewEl = new Audio(a.dataUrl);
  previewEl.dataset.key = a.key;
  void previewEl.play().catch(() => term.write("warn", `nie można odtworzyć ${a.name}\n`));
}
const NOTE_MIDI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function previewNote(note: string): void {
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) return;
  const midi = 12 * (Number(m[3]) + 1) + NOTE_MIDI[m[1]] + (m[2] ? 1 : 0);
  toneCtx ??= new AudioContext();
  const t0 = toneCtx.currentTime + 0.02;
  const osc = toneCtx.createOscillator();
  const g = toneCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
  osc.connect(g).connect(toneCtx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.4);
}

// ---- projekt / pliki ----
function renderProject(): void {
  project.setState({
    files: Object.keys(currentFiles),
    folders: [...currentFolders],
    entry: settings.entry,
    open: openFile,
    engineAssets: assetManifest.assets,
    userAssets: userAssets.list(),
  });
}

function insertAtCursor(snippet: string): void {
  if (!activeView.startsWith("file:")) activate(`file:${openFile}`);
  editor.insert(snippet);
  currentFiles[openFile] = editor.value;
  editor.focus();
}

const project = new ProjectPanel(projectEl, {
  onSelect(name) {
    activate(`file:${name}`);
  },
  onAdd(ext) {
    const base = ext === "json" || ext === "txt" ? "plik" : NEW_FILE_LANGS.find((l) => l.ext === ext)?.label.toLowerCase() ?? "plik";
    const name = prompt(`Nazwa nowego pliku (.${ext}):`, `${base}.${ext}`)?.trim();
    if (!name || currentFiles[name] !== undefined) return;
    const full = name.includes(".") ? name : `${name}.${ext}`;
    currentFiles[full] = `// ${full}\n`;
    renderViewTabs();
    renderProject();
    activate(`file:${full}`);
  },
  onAddKind(kind) {
    if (kind === "folder") {
      const name = prompt("Nazwa folderu (np. gfx lub sfx/menu):", "gfx")?.trim().replace(/[/\\]+$/g, "").replace(/^[/\\]+/g, "");
      if (!name) return;
      currentFolders.add(name);
      renderProject();
      return;
    }
    if (kind === "png") {
      const name = prompt("Nazwa obrazu (.png):", "sprite.png")?.trim();
      if (!name) return;
      const full = name.toLowerCase().endsWith(".png") ? name : `${name}.png`;
      if (currentFiles[full] !== undefined) return;
      currentFiles[full] = transparentPng(16);
      void registerProjectImage(full, currentFiles[full]);
      renderViewTabs();
      renderProject();
      activate(`file:${full}`);
      return;
    }
    const ext = kind === "sfx" ? "sfx" : "song";
    const name = prompt(`Nazwa dźwięku (.${ext}):`, `dziwek.${ext}`)?.trim();
    if (!name) return;
    const full = name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
    if (currentFiles[full] !== undefined) return;
    currentFiles[full] = kind === "sfx"
      ? JSON.stringify({ kind: "sfx", wave: "square", freq: 300, slide: -150, dur: 0.3, attack: 0.005, noise: 0.3, volume: 0.7 }, null, 1)
      : JSON.stringify({ kind: "song", bpm: 120, steps: 16, wave: "square", notes: [] }, null, 1);
    renderViewTabs();
    renderProject();
    activate(`file:${full}`);
  },
  onRename(name) {
    const next = prompt("Nowa nazwa pliku:", name)?.trim();
    if (!next || next === name || currentFiles[next] !== undefined) return;
    currentFiles[next] = currentFiles[name];
    delete currentFiles[name];
    editor.rename(name, next);
    if (settings.entry === name) settings.entry = next;
    if (openFile === name) openFile = next;
    renderViewTabs();
    renderProject();
  },
  onDelete(name) {
    if (name === settings.entry) return;
    delete currentFiles[name];
    editor.drop(name);
    if (openFile === name) activate(`file:${settings.entry}`);
    renderViewTabs();
    renderProject();
  },
  onSetEntry(name) {
    settings.entry = name;
    renderViewTabs();
    renderProject();
    term.write("sys", `plik startowy: ${name}\n`);
  },
  onAssetOpen(entry) {
    const key = (entry as AssetEntry).key ?? (entry as UserAsset).name;
    const u = entry as UserAsset;
    if (u.kind === "audio") {
      insertAtCursor(`this.sound.playSound(${JSON.stringify(u.name)})`);
      return;
    }
    if (!openAssets.includes(key)) openAssets.push(key);
    activate(`asset:${key}`);
  },
  onAssetDrop(files) {
    void (async () => {
      for (const file of Array.from(files)) {
        try {
          const asset = await addUserFile(file);
          if (asset.kind === "image") {
            registerAssetLive(asset);
            term.write("sys", `asset: ${asset.name} → tekstura ${asset.w}×${asset.h} — new GameLab.Sprite("${asset.name}", …)\n`);
          } else if (asset.kind === "audio") {
            term.write("sys", `dźwięk: ${asset.name} — this.sound.playSound("${asset.name}")\n`);
          } else {
            const path = `assets/user/${asset.name}`;
            currentFiles[path] = asset.text ?? asset.dataUrl;
            term.write("sys", `asset: ${asset.name} → ${path} — lab.readFile("${path}")\n`);
          }
        } catch (err) {
          term.write("error", `${err instanceof Error ? err.message : String(err)}\n`);
        }
      }
      renderViewTabs();
      renderProject();
      if (activeView === "sounds") renderSoundsView();
      else if (userAssets.list().some((a) => a.kind === "audio")) activate("sounds");
      else project.showTab("assets");
    })();
  },
  onAssetDelete(asset) {
    if (asset.kind === "image") unregisterTexture(null, asset.key);
    else if (asset.kind === "text") delete currentFiles[`assets/user/${asset.name}`];
    userAssets.remove(asset.key);
    openAssets = openAssets.filter((k) => k !== asset.key);
    if (activeView === `asset:${asset.key}`) activate(`file:${openFile}`);
    renderViewTabs();
    renderProject();
    if (activeView === "sounds") renderSoundsView();
  },
  onSoundPreview(x) {
    if (typeof x === "string") previewNote(x);
    else previewAudio(x);
  },
});

// ---- hierarchia sceny jak w Unity ----
const closedObjects = new Set<number>();
const closedComps = new Set<number>();

const LANG_COLORS: Record<string, string> = {
  lua: "#e06c75",
  python: "#61afef",
  javascript: "#98c379",
  typescript: "#4f9cf9",
  cpp: "#f18e32",
  csharp: "#b48ce0",
  java: "#e76f00",
};

function fmtVal(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}

function refreshWorldPanel(): void {
  const scene = host.world().describeScene();
  worldCountEl.textContent = String(scene.length);
  worldListEl.innerHTML = "";
  if (scene.length === 0) {
    const p = document.createElement("p");
    p.className = "world-empty";
    p.textContent = "scena pusta — zresp obiekt przez lab.spawn(\"nazwa\") i dodaj lab.attachComponent";
    worldListEl.appendChild(p);
    return;
  }
  for (const obj of scene) {
    const det = document.createElement("details");
    det.className = "w-obj";
    det.open = !closedObjects.has(obj.id);
    det.addEventListener("toggle", () => {
      if (det.open) closedObjects.delete(obj.id);
      else closedObjects.add(obj.id);
    });
    const sum = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "w-objname";
    name.textContent = obj.name;
    const oid = document.createElement("span");
    oid.className = "w-oid";
    oid.textContent = `obj ${obj.id}`;
    sum.append(name, oid);
    det.appendChild(sum);

    for (const c of obj.comps) {
      const cdet = document.createElement("details");
      cdet.className = "w-comp";
      cdet.open = !closedComps.has(c.id);
      cdet.addEventListener("toggle", () => {
        if (cdet.open) closedComps.delete(c.id);
        else closedComps.add(c.id);
      });
      const csum = document.createElement("summary");
      const kind = document.createElement("span");
      kind.className = "w-kind";
      kind.textContent = c.kind;
      const lang = document.createElement("span");
      lang.className = "w-lang";
      lang.style.background = `${LANG_COLORS[c.lang] ?? "#7d93a5"}22`;
      lang.style.color = LANG_COLORS[c.lang] ?? "#7d93a5";
      lang.textContent = c.lang;
      csum.append(kind, lang);
      cdet.appendChild(csum);

      const members = document.createElement("ul");
      members.className = "w-members";
      const listed = c.bridge.listMembers?.() ?? [];
      for (const m of listed) {
        const li = document.createElement("li");
        const mn = document.createElement("span");
        mn.className = m.kind === "method" ? "w-mname w-method" : "w-mname";
        mn.textContent = m.kind === "method" ? `${m.name}()` : m.name;
        li.appendChild(mn);
        if (m.kind === "prop") {
          const mv = document.createElement("span");
          mv.className = "w-mval";
          mv.textContent = `= ${fmtVal(c.bridge.get(m.name))}`;
          li.appendChild(mv);
        }
        members.appendChild(li);
      }
      if (!listed.length) {
        const li = document.createElement("li");
        li.className = "w-mname";
        li.textContent = "(brak publicznych składowych)";
        members.appendChild(li);
      }
      cdet.appendChild(members);
      det.appendChild(cdet);
    }
    if (!obj.comps.length) {
      const p = document.createElement("p");
      p.className = "w-nocomps";
      p.textContent = "brak komponentów";
      det.appendChild(p);
    }
    worldListEl.appendChild(det);
  }
}
setInterval(refreshWorldPanel, 500);

function drawCanvasPlaceholder(): void {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0a1524";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

host.onFps = (fps) => {
  fpsEl.textContent = `${fps} fps`;
};

function runtimeFor(file: string) {
  const e = extOf(file);
  return runtimes.find((r) => r.extensions.includes(e)) ?? runtimes[0];
}

async function run(): Promise<void> {
  if (running) return;
  const runtime = runtimeFor(settings.entry);
  running = true;
  runBtn.disabled = true;
  stopBtn.disabled = false;
  pauseBtn.disabled = false;
  restartBtn.disabled = false;
  pauseBtn.classList.remove("active");
  pauseBtn.textContent = "Pauza";
  fpsEl.textContent = "— fps";
  term.clear();
  currentFiles[openFile] = editor.value;
  const stdin = stdinEl.value.split("\\n").join("\n");
  canvas.width = 640;
  canvas.height = 480;
  canvas.closest(".lab-console-screen")?.querySelector(".emu-idle")?.remove();
  activate("emulator");

  try {
    term.setStatus("loading");
    await runtime.load?.((m) => term.write("sys", m + "\n"));
    term.write("sys", `[${runtime.label}] ${settings.entry}\n`);
    host.begin(stdin);
    // Świeża scena na run — stare komponenty/obiekty z poprzedniego
    // uruchomienia nie mogą wyciekać (Unity play-mode semantics).
    host.clearWorld();
    term.setStatus("running");
    canvas.focus();
    // lab.evalFile("x.lua") z kodu gry — wykonuje plik projektu w jego
    // runtime na TYM samym hoście/świecie (komponenty współdzielone).
    setEvalFileHook(async (name, h) => {
      const src = currentFiles[name];
      if (src == null) throw new Error(`evalFile: brak pliku ${name}`);
      const rt = runtimeFor(name);
      if (!rt.evalFile) throw new Error(`evalFile: ${rt.label} nie wspiera wykonania modułu`);
      if (rt.load) await rt.load((m) => term.write("sys", m + "\n"));
      term.write("sys", `[${rt.label}] evalFile ${name}\n`);
      await rt.evalFile(name, src, h);
    });
    const res = await runtime.run(
      { files: currentFiles, entry: settings.entry, stdin, entryMethod: settings.method || undefined },
      host,
    );
    term.write("sys", `\n[${res.status}]${res.message ? " " + res.message : ""}\n`);
    term.setStatus(res.status === "ok" || res.status === "stopped" ? "ready" : "error");
  } catch (err) {
    host.stderr(String(err) + "\n");
    term.setStatus("error");
  } finally {
    host.end();
    labEngineDisposed();
    refreshWorldPanel();
    running = false;
    runBtn.disabled = false;
    stopBtn.disabled = true;
    pauseBtn.disabled = true;
    fpsEl.textContent = "— fps";
    // przywróć ekran powitalny konsolki po zakończeniu
    const screen = canvas.closest(".lab-console-screen");
    if (screen && !screen.querySelector(".emu-idle")) {
      const idle = emuIdle.cloneNode(true) as HTMLElement;
      idle.removeAttribute("id");
      screen.appendChild(idle);
    }
    if (wantRestart) {
      wantRestart = false;
      setTimeout(() => void run(), 60);
    }
  }
}

editor.onDidChange(() => {
  currentFiles[openFile] = editor.value;
});
editor.addRunCommand(() => void run());
runBtn.onclick = run;
const orbitSendBtn = $<HTMLButtonElement>("#orbit-send");
// A parent origin is accepted only when it agrees with the browser referrer.
// No credentials are shared with the editor.
let orbitParentOrigin: string | null = null;
try {
  const requested = new URLSearchParams(location.search).get("orbitParent");
  if (window.parent !== window && requested && document.referrer && new URL(requested).origin === requested && new URL(document.referrer).origin === requested) orbitParentOrigin = requested;
} catch { /* Standalone mode has no launcher handoff. */ }
orbitSendBtn.hidden = !orbitParentOrigin;
function exportOrbit(sendToLauncher: boolean) {
  currentFiles[openFile] = editor.value;
  const proposedName = settings.entry.replace(/\.(m?js)$/i, "").replace(/[^A-Za-z0-9 _-]+/g, " ").trim() || "Moja gra";
  const name = prompt("Nazwa gry", proposedName);
  if (!name) return;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gra";
  const id = prompt("ID pakietu Orbit (max 48 znaków)", `com.orbit.${slug}`);
  if (!id) return;
  const version = prompt("Wersja gry", "0.1.0");
  if (!version) return;
  try {
    const unsupportedAsset = userAssets.list().find(asset => asset.kind !== "text");
    if (unsupportedAsset) throw new Error(`Orbit v0 nie pakuje jeszcze assetów obrazu/audio: ${unsupportedAsset.name}.`);
    const bytes = buildOrbitPackage(currentFiles, settings.entry, { id: id.trim(), version: version.trim(), name: name.trim() });
    if (sendToLauncher) {
      if (!orbitParentOrigin) throw new Error("Brak połączenia z launcherem.");
      const payload = bytes.slice().buffer;
      const requestId = crypto.randomUUID();
      const expectedOrigin = orbitParentOrigin;
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", acknowledge);
        term.write("error", "Launcher nie potwierdził odbioru paczki. Spróbuj ponownie.\n");
      }, 10000);
      function acknowledge(event: MessageEvent) {
        if (event.source !== window.parent || event.origin !== expectedOrigin || event.data?.type !== "orbit:game-package-ack" || event.data?.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener("message", acknowledge);
        term.write("sys", "Launcher odebrał paczkę — wybierz publikację w sekcji Konsolki\n");
      }
      window.addEventListener("message", acknowledge);
      window.parent.postMessage({ type: "orbit:game-package", version: 1, requestId, name: `${id.trim()}-${version.trim()}.orbit`, bytes: payload }, expectedOrigin, [payload]);
      return;
    }
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id.trim()}-${version.trim()}.orbit`;
    a.click();
    URL.revokeObjectURL(url);
    term.write("sys", `wyeksportowano ${a.download} — wrzuć paczkę w Nekko Launcher → Konsolki → Opublikuj grę konsolową\n`);
  } catch (err) {
    term.write("error", `${err instanceof Error ? err.message : String(err)}\n`);
  }
}
orbitExportBtn.onclick = () => exportOrbit(false);
orbitSendBtn.onclick = () => exportOrbit(true);
stopBtn.onclick = () => {
  const rt = runtimeFor(settings.entry);
  rt.stop();
  host.requestStop();
  term.write("sys", "zatrzymuję…\n");
};
restartBtn.onclick = () => {
  if (!running) return;
  wantRestart = true;
  runtimeFor(settings.entry).stop();
  host.requestStop();
  term.write("sys", "restart…\n");
};
pauseBtn.onclick = () => {
  const next = !host.isPaused;
  host.setPaused(next);
  pauseBtn.classList.toggle("active", next);
  pauseBtn.textContent = next ? "Wznów" : "Pauza";
  term.write("sys", next ? "pauza\n" : "wznawiam…\n");
  canvas.focus();
};
consoleToggle.onclick = () => {
  const collapsed = consoleSection.classList.toggle("collapsed");
  consoleToggle.setAttribute("aria-expanded", String(!collapsed));
};
let copyTimer = 0;
copyBtn.onclick = async () => {
  try {
    await navigator.clipboard.writeText(term.getText());
    copyStatus.textContent = "Skopiowano kod";
  } catch {
    copyStatus.textContent = "Zaznacz i użyj Ctrl+C.";
  }
  clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => (copyStatus.textContent = ""), 1600);
};
wsBtn.onclick = () => {
  const on = term.toggleWhitespace();
  wsBtn.setAttribute("aria-pressed", String(on));
  wsBtn.classList.toggle("on", on);
};
ccClearBtn.onclick = () => term.clear();
clearAllBtn.onclick = () => {
  term.clear();
  host.clearWorld();
  refreshWorldPanel();
  term.write("sys", "konsola i świat wyczyszczone\n");
};

// ---- ustawienia ----
settingsBtn.onclick = () => {
  setEntrySel.innerHTML = "";
  for (const f of Object.keys(currentFiles)) {
    const o = document.createElement("option");
    o.value = o.textContent = f;
    if (f === settings.entry) o.selected = true;
    setEntrySel.appendChild(o);
  }
  setMethodInput.value = settings.method;
  settingsModal.showModal();
};
settingsModal.querySelector("form")!.addEventListener("submit", () => {
  settings.entry = setEntrySel.value;
  settings.method = setMethodInput.value.trim();
  try {
    localStorage.setItem("lab-core-settings", JSON.stringify(settings));
  } catch {
    /* ok */
  }
  renderViewTabs();
  renderProject();
  term.write("sys", `start: ${settings.entry}${settings.method ? ` → ${settings.method}()` : ""}\n`);
});

// ---- skala emulatora: auto-dopasowanie + custom zoom ----
let customZoom: number | null = null;
let lastAutoScale = 1;
try {
  const z = parseFloat(localStorage.getItem("lab-core-emu-zoom") ?? "");
  if (Number.isFinite(z)) customZoom = Math.min(3, Math.max(0.3, z));
} catch {
  /* ok */
}

function fitEmulator(): void {
  const w0 = labShellEl.offsetWidth;
  const h0 = labShellEl.offsetHeight;
  if (!w0 || !h0) return;
  const availW = emuStage.clientWidth - 16;
  const availH = emuStage.clientHeight - 16;
  lastAutoScale = Math.max(0.25, Math.min(1, availW / w0, availH / h0));
  const s = customZoom ?? lastAutoScale;
  labShellEl.style.transform = `scale(${s})`;
  labShellEl.style.transformOrigin = "top left";
  labConsoleEl.style.width = `${Math.round(w0 * s)}px`;
  labConsoleEl.style.height = `${Math.round(h0 * s)}px`;
  zoomLabel.textContent = customZoom ? `${Math.round(s * 100)}%` : `auto ${Math.round(s * 100)}%`;
}

function setZoom(z: number | null): void {
  customZoom = z == null ? null : Math.min(3, Math.max(0.3, z));
  try {
    if (customZoom == null) localStorage.removeItem("lab-core-emu-zoom");
    else localStorage.setItem("lab-core-emu-zoom", String(customZoom));
  } catch {
    /* ok */
  }
  fitEmulator();
}
const stepZoom = (dir: number) => setZoom((customZoom ?? lastAutoScale) + dir * 0.15);
zoomOutBtn.onclick = () => stepZoom(-1);
zoomInBtn.onclick = () => stepZoom(1);
zoomFitBtn.onclick = () => setZoom(null);
emuStage.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom((customZoom ?? lastAutoScale) + (e.deltaY < 0 ? 0.1 : -0.1));
  },
  { passive: false },
);
new ResizeObserver(fitEmulator).observe(emuStage);
fitEmulator();

// ---- resizery: lewy panel i konsola ----
function makeResizer(handle: HTMLElement, onDrag: (dx: number, dy: number) => void): void {
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => onDrag(ev.clientX - sx, ev.clientY - sy);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
}
makeResizer($("#rs-left"), (dx) => {
  const w = projectEl.getBoundingClientRect().width;
  projectEl.style.flexBasis = `${Math.min(420, Math.max(128, w + dx))}px`;
});
makeResizer($("#rs-console"), (dx, dy) => {
  const h = consoleSection.getBoundingClientRect().height;
  consoleSection.style.height = `${Math.min(480, Math.max(38, h - dy))}px`;
  consoleSection.style.flex = "none";
});

// ---- start ----
ensureConsoleStyle();
const seed = examples.find((e) => e.id === "zombie-survival") ?? examples[0];
currentFiles = { ...seed.files };
if (!currentFiles[settings.entry]) settings.entry = seed.entry;
openFile = settings.entry in currentFiles ? settings.entry : seed.entry;
activeView = `file:${openFile}`;
syncEditorToFile(openFile);
renderViewTabs();
renderProject();
refreshWorldPanel();
drawCanvasPlaceholder();
activate(activeView);
