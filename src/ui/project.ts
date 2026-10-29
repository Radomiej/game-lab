// Panel "Project" w stylu Unity: drzewo plików projektu + sekcja assetów.
// Pliki pod ścieżką "assets/…" grupuje do folderu Assets; do tego wiersze
// wbudowanych assetów silnika (lab.asset) — read-only.
export interface ProjectState {
  files: string[];
  entry: string;
  open: string;
  builtinAssets: string[];
}

export interface ProjectCallbacks {
  onSelect(name: string): void;
  onAdd(): void;
  onRename(name: string): void;
  onDelete(name: string): void;
  onSetEntry(name: string): void;
}

const EXT_BADGE: Record<string, { tag: string; color: string }> = {
  js: { tag: "JS", color: "#e8c169" },
  mjs: { tag: "JS", color: "#e8c169" },
  ts: { tag: "TS", color: "#4f9cf9" },
  lua: { tag: "Lu", color: "#7d9ff0" },
  py: { tag: "Py", color: "#6dc276" },
  cpp: { tag: "C+", color: "#f18e32" },
  cc: { tag: "C+", color: "#f18e32" },
  cxx: { tag: "C+", color: "#f18e32" },
  h: { tag: "h", color: "#c98fbf" },
  cs: { tag: "C#", color: "#b48ce0" },
  java: { tag: "Jv", color: "#e76f00" },
  json: { tag: "{}", color: "#8be9fd" },
  txt: { tag: "Tx", color: "#9fb3c4" },
  md: { tag: "Md", color: "#9fb3c4" },
};

const FILE_BADGE = { tag: "ƒ", color: "#7d93a5" };
const ASSET_BADGE = { tag: "◆", color: "#65d6c8" };

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

function fileName(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export class ProjectPanel {
  private state: ProjectState = { files: [], entry: "", open: "", builtinAssets: [] };

  constructor(
    private readonly el: HTMLElement,
    private readonly cb: ProjectCallbacks,
  ) {
    this.el.classList.add("project-pane");
  }

  setState(state: ProjectState): void {
    this.state = state;
    this.render();
  }

  private badge(kind: { tag: string; color: string }): HTMLElement {
    const b = document.createElement("span");
    b.className = "pj-badge";
    b.style.color = kind.color;
    b.textContent = kind.tag;
    return b;
  }

  private fileRow(path: string): HTMLElement {
    const { entry, open } = this.state;
    const li = document.createElement("li");
    li.className = "pj-row";
    if (path === open) li.classList.add("open");
    li.dataset.path = path;

    const btn = document.createElement("button");
    btn.className = "pj-name";
    btn.title = path;
    btn.onclick = () => this.cb.onSelect(path);
    btn.append(this.badge(EXT_BADGE[ext(path)] ?? FILE_BADGE));
    const nm = document.createElement("span");
    nm.className = "pj-label";
    nm.textContent = fileName(path);
    btn.appendChild(nm);
    if (path === entry) {
      const star = document.createElement("span");
      star.className = "pj-entry";
      star.title = "Plik startowy";
      star.textContent = "★";
      btn.appendChild(star);
    }
    li.appendChild(btn);

    const actions = document.createElement("span");
    actions.className = "pj-actions";
    const mk = (title: string, glyph: string, fn: () => void) => {
      const a = document.createElement("button");
      a.className = "pj-action";
      a.title = title;
      a.setAttribute("aria-label", `${title}: ${path}`);
      a.textContent = glyph;
      a.onclick = (e) => {
        e.stopPropagation();
        fn();
      };
      return a;
    };
    if (path !== entry) actions.appendChild(mk("Ustaw jako startowy", "★", () => this.cb.onSetEntry(path)));
    actions.appendChild(mk("Zmień nazwę", "✎", () => this.cb.onRename(path)));
    actions.appendChild(mk("Usuń plik", "×", () => this.cb.onDelete(path)));
    li.appendChild(actions);
    return li;
  }

  private render(): void {
    this.el.replaceChildren();

    const head = document.createElement("div");
    head.className = "project-heading";
    const h = document.createElement("h3");
    h.textContent = "Projekt";
    const add = document.createElement("button");
    add.className = "pj-action pj-add";
    add.title = "Nowy plik";
    add.setAttribute("aria-label", "Nowy plik");
    add.textContent = "+";
    add.onclick = () => this.cb.onAdd();
    head.append(h, add);
    this.el.appendChild(head);

    // Grupowanie jak w Unity: folder per pierwszy segment ścieżki, reszta luzem.
    const groups = new Map<string, string[]>();
    for (const f of this.state.files) {
      const i = f.indexOf("/");
      const dir = i < 0 ? "" : f.slice(0, i);
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir)!.push(f);
    }

    for (const [dir, files] of groups) {
      const sec = document.createElement("div");
      sec.className = "project-section";
      sec.textContent = dir ? `${dir}/` : "Pliki";
      this.el.appendChild(sec);
      const ul = document.createElement("ul");
      ul.className = "pj-list";
      for (const f of files) ul.appendChild(this.fileRow(f));
      this.el.appendChild(ul);
    }

    if (this.state.builtinAssets.length) {
      const sec = document.createElement("div");
      sec.className = "project-section";
      sec.textContent = "Assets silnika";
      this.el.appendChild(sec);
      const ul = document.createElement("ul");
      ul.className = "pj-list";
      for (const name of this.state.builtinAssets) {
        const li = document.createElement("li");
        li.className = "pj-row pj-asset";
        const btn = document.createElement("button");
        btn.className = "pj-name";
        btn.title = `${name} — wbudowany asset (lab.asset("${name}"))`;
        btn.onclick = () => this.cb.onSelect(`asset:${name}`);
        btn.append(this.badge(ASSET_BADGE));
        const nm = document.createElement("span");
        nm.className = "pj-label";
        nm.textContent = name;
        btn.appendChild(nm);
        li.appendChild(btn);
        ul.appendChild(li);
      }
      this.el.appendChild(ul);
    }
  }
}
