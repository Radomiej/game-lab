import { DomLabHost } from "./core/host";
import { RuntimeConsole } from "./ui/console";
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
}

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

function refreshWorldPanel(): void {
  const comps = host.world().describe();
  worldCountEl.textContent = String(comps.length);
  worldListEl.innerHTML = "";
  if (comps.length === 0) {
    const li = document.createElement("li");
    li.className = "world-empty";
    li.textContent = "brak komponentów — zarejestruj je przez lab.attachComponent";
    worldListEl.appendChild(li);
    return;
  }
  for (const c of comps) {
    const li = document.createElement("li");
    const kind = document.createElement("span");
    kind.className = "w-kind";
    kind.textContent = c.kind;
    const meta = document.createElement("span");
    meta.className = "w-lang";
    meta.textContent = `  ${c.lang} · obj ${c.objectId} · #${c.id}`;
    li.append(kind, meta);
    worldListEl.appendChild(li);
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
clearBtn.onclick = () => {
  host.clearWorld();
  refreshWorldPanel();
  term.write("sys", "świat wyczyszczony\n");
};

fillLanguages();
fillExamples(currentRuntime.id);
refreshWorldPanel();
drawCanvasPlaceholder();
