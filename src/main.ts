import { DomLabHost, LAB_ASSETS } from "./core/host";
import { RuntimeConsole } from "./ui/console";
import { ProjectPanel } from "./ui/project";
import { runtimes } from "./runtimes";
import { examples } from "./examples";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const langSel = $<HTMLSelectElement>("#lang");
const exSel = $<HTMLSelectElement>("#example");
const runBtn = $<HTMLButtonElement>("#run");
const stopBtn = $<HTMLButtonElement>("#stop");
const clearBtn = $<HTMLButtonElement>("#clear-world");
const consoleEl = $("#console");
const pillEl = $("#status-pill");
const stdinEl = $<HTMLInputElement>("#stdin");
const canvas = $<HTMLCanvasElement>("#canvas");
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
const editor = $<HTMLTextAreaElement>("#editor");
const gutterEl = $("#gutter");
const tabsEl = $("#file-tabs");
const worldListEl = $("#world-list");
const worldCountEl = $("#world-count");

const term = new RuntimeConsole(consoleEl, pillEl);
const host = new DomLabHost(term, canvas);
let currentRuntime = runtimes[0];
let currentFiles: Record<string, string> = {};
let entryFile = "main.js";
let openFile = entryFile;
let running = false;
let wantRestart = false;

function fillLanguages(): void {
  langSel.innerHTML = "";
  for (const rt of runtimes) {
    const opt = document.createElement("option");
    opt.value = rt.id;
    opt.textContent = rt.label;
    langSel.appendChild(opt);
  }
}

function fillExamples(runtimeId: string): void {
  const list = examples.filter((e) => e.runtime === runtimeId);
  exSel.innerHTML = "";
  for (const e of list) {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.label;
    exSel.appendChild(opt);
  }
  loadExample(list[0]?.id);
}

function loadExample(id?: string): void {
  const ex = examples.find((e) => e.id === id);
  if (!ex) return;
  currentFiles = { ...ex.files };
  entryFile = ex.entry;
  openFile = ex.entry;
  stdinEl.value = ex.stdin ?? "";
  renderTabs();
  editor.value = currentFiles[openFile] ?? "";
  syncGutter();
  renderProject();
}

function renderProject(): void {
  project.setState({
    files: Object.keys(currentFiles),
    entry: entryFile,
    open: openFile,
    builtinAssets: Object.keys(LAB_ASSETS),
  });
}

function openInEditor(name: string): void {
  currentFiles[openFile] = editor.value;
  openFile = name;
  editor.value = currentFiles[name] ?? "";
  syncGutter();
  renderTabs();
  renderProject();
  editor.focus();
}

function insertAtCursor(snippet: string): void {
  const s = editor.selectionStart;
  editor.value = editor.value.slice(0, s) + snippet + editor.value.slice(editor.selectionEnd);
  editor.selectionStart = editor.selectionEnd = s + snippet.length;
  currentFiles[openFile] = editor.value;
  syncGutter();
  editor.focus();
}

const project = new ProjectPanel(projectEl, {
  onSelect(name) {
    if (name.startsWith("asset:")) {
      insertAtCursor(`lab.asset(${JSON.stringify(name.slice(6))})`);
      return;
    }
    openInEditor(name);
  },
  onAdd() {
    const defExt = currentRuntime.extensions[0] ?? "js";
    const name = prompt(`Nazwa nowego pliku (np. utils.${defExt}):`, `utils.${defExt}`)?.trim();
    if (!name || currentFiles[name] !== undefined) return;
    currentFiles[name] = "// nowy plik\n";
    renderTabs();
    renderProject();
  },
  onRename(name) {
    const next = prompt("Nowa nazwa pliku:", name)?.trim();
    if (!next || next === name || currentFiles[next] !== undefined) return;
    currentFiles[next] = currentFiles[name];
    delete currentFiles[name];
    if (entryFile === name) entryFile = next;
    if (openFile === name) openFile = next;
    renderTabs();
    renderProject();
  },
  onDelete(name) {
    if (name === entryFile) return;
    delete currentFiles[name];
    if (openFile === name) openInEditor(entryFile);
    renderTabs();
    renderProject();
  },
  onSetEntry(name) {
    entryFile = name;
    renderProject();
    term.write("sys", `plik startowy: ${name}\n`);
  },
});

function renderTabs(): void {
  tabsEl.innerHTML = "";
  for (const name of Object.keys(currentFiles)) {
    const b = document.createElement("button");
    b.textContent = name;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(name === openFile));
    if (name === openFile) b.classList.add("active");
    b.onclick = () => {
      currentFiles[openFile] = editor.value;
      openFile = name;
      editor.value = currentFiles[name] ?? "";
      syncGutter();
      renderTabs();
      editor.focus();
    };
    tabsEl.appendChild(b);
  }
}

function syncGutter(): void {
  const lines = editor.value.split("\n").length;
  const nums = gutterEl.childElementCount;
  if (nums !== lines) {
    gutterEl.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  }
  gutterEl.scrollTop = editor.scrollTop;
}

// Hierarchia sceny jak w Unity: GameObject → komponenty → publiczne składowe.
// Natywne <details>/<summary> = zwijanie z klawiatury i czytników za darmo.
// Zwinięte węzły pamiętamy w setach — prze-renderowanie co 500 ms ich nie zamyka.
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
  ctx.fillStyle = "#24384a";
  ctx.font = "12px 'Cascadia Code', Consolas, monospace";
  ctx.textAlign = "center";
  ctx.fillText("podgląd gry — lab.draw*() trafia tutaj", canvas.width / 2, canvas.height / 2);
}

host.onFps = (fps) => {
  fpsEl.textContent = `${fps} fps`;
};

async function run(): Promise<void> {
  if (running) return;
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
  canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);

  try {
    term.setStatus("loading");
    await currentRuntime.load?.((m) => term.write("sys", m + "\n"));
    term.write("sys", `[${currentRuntime.label}] start\n`);
    host.begin(stdin);
    term.setStatus("running");
    canvas.focus();
    const res = await currentRuntime.run(
      { files: currentFiles, entry: entryFile, stdin },
      host,
    );
    term.write("sys", `\n[${res.status}]${res.message ? " " + res.message : ""}\n`);
    term.setStatus(res.status === "ok" ? "ready" : "error");
  } catch (err) {
    host.stderr(String(err) + "\n");
    term.setStatus("error");
  } finally {
    host.end();
    refreshWorldPanel();
    running = false;
    runBtn.disabled = false;
    stopBtn.disabled = true;
    pauseBtn.disabled = true;
    fpsEl.textContent = "— fps";
    if (wantRestart) {
      wantRestart = false;
      setTimeout(() => void run(), 60);
    }
  }
}

langSel.onchange = () => {
  currentRuntime = runtimes.find((r) => r.id === langSel.value) ?? runtimes[0];
  fillExamples(currentRuntime.id);
};
exSel.onchange = () => loadExample(exSel.value);
editor.oninput = () => {
  currentFiles[openFile] = editor.value;
  syncGutter();
};
editor.onscroll = () => {
  gutterEl.scrollTop = editor.scrollTop;
};
editor.onkeydown = (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const { selectionStart: s, selectionEnd: e2 } = editor;
    editor.value = editor.value.slice(0, s) + "  " + editor.value.slice(e2);
    editor.selectionStart = editor.selectionEnd = s + 2;
    currentFiles[openFile] = editor.value;
    syncGutter();
  } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    void run();
  }
};
runBtn.onclick = run;
stopBtn.onclick = () => {
  currentRuntime.stop();
  host.requestStop();
  term.write("sys", "zatrzymuję…\n");
};
restartBtn.onclick = () => {
  if (!running) return;
  wantRestart = true;
  currentRuntime.stop();
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
  // wzorzec CopyCodeButton z shared/lab-game-v2: status obok przycisku
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
clearBtn.onclick = () => {
  host.clearWorld();
  refreshWorldPanel();
  term.write("sys", "świat wyczyszczony\n");
};

fillLanguages();
fillExamples(currentRuntime.id);
refreshWorldPanel();
drawCanvasPlaceholder();
