// Monaco wrapper — jeden edytor, model per plik projektu (undo per plik).
// Workery lokalne przez ?worker (same-origin — zgodne z COEP require-corp).
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "typescript" || label === "javascript") return new tsWorker();
    if (label === "json") return new jsonWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    return new editorWorker();
  },
};

const LANG_BY_EXT: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  ts: "typescript",
  lua: "lua",
  luau: "lua",
  py: "python",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "cpp",
  hpp: "cpp",
  cs: "csharp",
  java: "java",
  php: "php",
  json: "json",
  md: "markdown",
  html: "html",
  css: "css",
  xml: "xml",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql",
};

function langFor(name: string): string {
  const i = name.lastIndexOf(".");
  const ext = i < 0 ? "" : name.slice(i + 1).toLowerCase();
  return LANG_BY_EXT[ext] ?? "plaintext";
}

monaco.editor.defineTheme("lab-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "5c7a8f", fontStyle: "italic" },
    { token: "keyword", foreground: "7ea4f7" },
    { token: "string", foreground: "9ece6a" },
    { token: "number", foreground: "e8a04f" },
  ],
  colors: {
    "editor.background": "#0d1117",
    "editor.foreground": "#d6e2ee",
    "editor.lineHighlightBackground": "#151c26",
    "editorLineNumber.foreground": "#3d5266",
    "editorLineNumber.activeForeground": "#7ea4f7",
    "editor.selectionBackground": "#264a6d",
    "editorCursor.foreground": "#7ea4f7",
    "editorIndentGuide.background1": "#1b2634",
    "editorIndentGuide.activeBackground1": "#2c4258",
    "scrollbar.shadow": "#00000000",
  },
});

export class CodeEditor {
  private readonly editor: monaco.editor.IStandaloneCodeEditor;
  private readonly models = new Map<string, monaco.editor.ITextModel>();
  private current = "";

  constructor(host: HTMLElement) {
    this.editor = monaco.editor.create(host, {
      theme: "lab-dark",
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      fontLigatures: true,
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: false,
      minimap: { enabled: false },
      lineNumbersMinChars: 3,
      scrollBeyondLastLine: false,
      renderWhitespace: "none",
      wordWrap: "off",
      fixedOverflowWidgets: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      padding: { top: 8 },
    });
  }

  /** Przełącza model na plik `name`; treść z `content` przy pierwszym otwarciu. */
  open(name: string, content: string): void {
    this.current = name;
    let model = this.models.get(name);
    if (!model || model.isDisposed()) {
      model = monaco.editor.createModel(content, langFor(name), monaco.Uri.parse(`inmemory://file/${name}`));
      this.models.set(name, model);
    }
    if (this.editor.getModel() !== model) this.editor.setModel(model);
    else if (model.getValue() !== content) model.setValue(content);
  }

  /** Aktualny plik (nazwa modelu). */
  get fileName(): string {
    return this.current;
  }

  get value(): string {
    return this.editor.getValue();
  }

  set value(v: string) {
    const model = this.editor.getModel();
    if (model && model.getValue() !== v) model.setValue(v);
  }

  /** Usuwa model pliku (po delete/rename). */
  drop(name: string): void {
    const m = this.models.get(name);
    this.models.delete(name);
    m?.dispose();
  }

  /** Podmiana identyfikatora modelu przy rename — zachowuje undo. */
  rename(oldName: string, newName: string): void {
    const m = this.models.get(oldName);
    if (!m) return;
    this.models.delete(oldName);
    this.models.set(newName, m);
    monaco.editor.setModelLanguage(m, langFor(newName));
  }

  /** Wstawia tekst w miejscu kursora/zaznaczenia. */
  insert(text: string): void {
    const sel = this.editor.getSelection();
    if (!sel) return;
    this.editor.executeEdits("snippet", [{ range: sel, text }]);
    this.editor.pushUndoStop();
  }

  onDidChange(cb: () => void): void {
    this.editor.onDidChangeModelContent(() => cb());
  }

  addRunCommand(cb: () => void): void {
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, cb);
  }

  focus(): void {
    this.editor.focus();
  }

  dispose(): void {
    this.editor.dispose();
    for (const m of this.models.values()) m.dispose();
  }
}
