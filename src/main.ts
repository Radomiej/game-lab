import { DomLabHost } from "./core/host";
import { runtimes } from "./runtimes";
import { examples } from "./examples";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const langSel = $<HTMLSelectElement>("#lang");
const exSel = $<HTMLSelectElement>("#example");
const runBtn = $<HTMLButtonElement>("#run");
const stopBtn = $<HTMLButtonElement>("#stop");
const clearBtn = $<HTMLButtonElement>("#clear-world");
const statusEl = $("#status");
const consoleEl = $("#console");
const canvas = $<HTMLCanvasElement>("#canvas");
const editor = $<HTMLTextAreaElement>("#editor");
const tabsEl = $("#file-tabs");

const host = new DomLabHost(consoleEl, canvas);
let currentRuntime = runtimes[0];
let currentFiles: Record<string, string> = {};
let entryFile = "main.js";
let openFile = entryFile;
let running = false;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

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
  renderTabs();
  editor.value = currentFiles[openFile] ?? "";
  consoleEl.dataset.stdin = ex.stdin ?? "";
}

function renderTabs(): void {
  tabsEl.innerHTML = "";
  for (const name of Object.keys(currentFiles)) {
    const b = document.createElement("button");
    b.textContent = name;
    if (name === openFile) b.classList.add("active");
    b.onclick = () => {
      openFile = name;
      editor.value = currentFiles[name] ?? "";
      renderTabs();
    };
    tabsEl.appendChild(b);
  }
}

async function run(): Promise<void> {
  if (running) return;
  running = true;
  runBtn.disabled = true;
  stopBtn.disabled = false;
  consoleEl.innerHTML = "";
  currentFiles[openFile] = editor.value;
  const stdin = consoleEl.dataset.stdin || "";

  const sys = (msg: string) => {
    const s = document.createElement("span");
    s.className = "sys";
    s.textContent = msg;
    consoleEl.appendChild(s);
  };

  try {
    setStatus("ładowanie runtime…");
    await currentRuntime.load?.((m) => setStatus(m));
    sys(`[${currentRuntime.label}] start\n`);
    host.begin(stdin);
    setStatus("running");
    canvas.focus();
    const res = await currentRuntime.run(
      { files: currentFiles, entry: entryFile, stdin },
      host,
    );
    if (res.message) sys(`\n[${res.status}] ${res.message}\n`);
    else sys(`\n[${res.status}]\n`);
    setStatus(res.status);
  } catch (err) {
    host.stderr(String(err));
    setStatus("error");
  } finally {
    host.end();
    running = false;
    runBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

langSel.onchange = () => {
  currentRuntime = runtimes.find((r) => r.id === langSel.value) ?? runtimes[0];
  fillExamples(currentRuntime.id);
};
exSel.onchange = () => loadExample(exSel.value);
editor.oninput = () => {
  currentFiles[openFile] = editor.value;
};
runBtn.onclick = run;
stopBtn.onclick = () => {
  currentRuntime.stop();
  host.requestStop();
  setStatus("stopping…");
};
clearBtn.onclick = () => {
  host.clearWorld();
  setStatus("świat wyczyszczony");
};

fillLanguages();
fillExamples(currentRuntime.id);
setStatus("gotowe");
