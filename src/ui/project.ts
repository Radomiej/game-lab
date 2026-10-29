// Panel "Project" jak w Unity z zakładkami nawigacji: Pliki / Assety / Dźwięki.
// Pliki: grupowanie po folderze, "+" otwiera menu języka nowego pliku.
// Assety: wbudowane tekstury silnika + assety użytkownika (dropzone).
// Dźwięki: syntezator (nuty) + audio użytkownika; klik = podgląd.
import type { AssetEntry } from "../engine/assets/Assets.js";
import type { UserAsset } from "../core/userAssets";
import { imageThumb, spriteThumb } from "./assetThumbs";

export interface ProjectState {
  files: string[];
  entry: string;
  open: string;
  engineAssets: AssetEntry[];
  userAssets: UserAsset[];
}

export interface ProjectCallbacks {
  /** Otwiera plik w centralnej zakładce edytora. */
  onSelect(name: string): void;
  /** Nowy plik w wybranym języku (rozszerzenie z menu). */
  onAdd(ext: string): void;
  onRename(name: string): void;
  onDelete(name: string): void;
  onSetEntry(name: string): void;
  /** Otwiera asset w centralnej zakładce podglądu. */
  onAssetOpen(entry: AssetEntry | UserAsset): void;
  /** Pliki upuszczone na dropzone (assety + dźwięki). */
  onAssetDrop(files: FileList): void;
  onAssetDelete(asset: UserAsset): void;
  /** Odsłuch dźwięku (audio usera albo nuta syntezatora). */
  onSoundPreview(asset: UserAsset | string): void;
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
const AUDIO_BADGE = { tag: "♪", color: "#ffd166" };

// Języki dostępne przy "+ Nowy plik" — rozszerzenie wybiera runtime przy RUN.
export const NEW_FILE_LANGS: Array<{ ext: string; label: string }> = [
  { ext: "js", label: "JavaScript" },
  { ext: "ts", label: "TypeScript" },
  { ext: "lua", label: "Lua" },
  { ext: "py", label: "Python" },
  { ext: "cpp", label: "C++" },
  { ext: "cs", label: "C#" },
  { ext: "java", label: "Java" },
  { ext: "json", label: "JSON" },
  { ext: "txt", label: "Tekst" },
];

const CATEGORY_LABELS: Record<string, string> = {
  characters: "Postacie",
  combat: "Walka",
  terrain: "Teren",
  world: "Świat",
  ui: "UI",
  user: "Użytkownika",
};

// Nuty syntezatora — this.audio.playNote("C5") w grze.
export const SOUND_NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "E5", "G5", "A5", "C6"];

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

function fileName(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

type TabId = "files" | "assets" | "sounds";

export class ProjectPanel {
  private state: ProjectState = { files: [], entry: "", open: "", engineAssets: [], userAssets: [] };
  private tab: TabId = "files";
  private fileInput: HTMLInputElement | null = null;
  private langMenu: HTMLElement | null = null;

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

  showTab(tab: TabId): void {
    this.tab = tab;
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

  private renderTabs(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "pj-tabs";
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Widok projektu");
    const mk = (id: TabId, label: string) => {
      const b = document.createElement("button");
      b.className = "pj-tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(this.tab === id));
      if (this.tab === id) b.classList.add("active");
      b.textContent = label;
      b.onclick = () => {
        this.tab = id;
        this.render();
      };
      return b;
    };
    bar.append(mk("files", "Pliki"), mk("assets", "Assety"), mk("sounds", "Dźwięki"));
    return bar;
  }

  private renderLangMenu(anchor: HTMLElement): void {
    this.langMenu?.remove();
    const menu = document.createElement("div");
    menu.className = "lang-menu";
    menu.setAttribute("role", "menu");
    for (const l of NEW_FILE_LANGS) {
      const b = document.createElement("button");
      b.className = "lang-option";
      b.setAttribute("role", "menuitem");
      b.append(this.badge(EXT_BADGE[l.ext] ?? FILE_BADGE));
      const s = document.createElement("span");
      s.textContent = l.label;
      b.appendChild(s);
      b.onclick = () => {
        close();
        this.cb.onAdd(l.ext);
      };
      menu.appendChild(b);
    }
    const onDoc = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== anchor) close();
    };
    const close = () => {
      menu.remove();
      this.langMenu = null;
      document.removeEventListener("pointerdown", onDoc, true);
    };
    document.addEventListener("pointerdown", onDoc, true);
    anchor.parentElement!.style.position = "relative";
    anchor.after(menu);
    this.langMenu = menu;
  }

  private renderDropzone(audioOnly = false): HTMLElement {
    const dz = document.createElement("div");
    dz.className = "asset-dropzone";
    dz.setAttribute("role", "button");
    dz.tabIndex = 0;
    dz.setAttribute("aria-label", audioOnly ? "Dodaj dźwięk" : "Dodaj własny asset — przeciągnij plik lub kliknij");
    dz.innerHTML = audioOnly
      ? '<span class="dz-icon" aria-hidden="true">♪</span> Przeciągnij dźwięk (mp3/wav/ogg) <span class="dz-sub">zagra przez this.sound.playSound("nazwa")</span>'
      : '<span class="dz-icon" aria-hidden="true">⇩</span> Przeciągnij asset tutaj <span class="dz-sub">grafika → tekstura · dźwięk → Dźwięki · tekst → assets/user/</span>';
    const add = (files: FileList | null) => {
      if (files?.length) this.cb.onAssetDrop(files);
    };
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      dz.classList.add("over");
    });
    dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("over");
      add(e.dataTransfer?.files ?? null);
    });
    dz.addEventListener("click", () => this.pickFiles());
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.pickFiles();
      }
    });
    return dz;
  }

  private pickFiles(): void {
    this.fileInput ??= (() => {
      const i = document.createElement("input");
      i.type = "file";
      i.multiple = true;
      i.hidden = true;
      i.onchange = () => {
        if (i.files?.length) this.cb.onAssetDrop(i.files);
        i.value = "";
      };
      return i;
    })();
    this.fileInput.click();
  }

  private assetTile(
    key: string,
    title: string,
    thumb: HTMLElement,
    onPick: () => void,
    onDelete?: () => void,
  ): HTMLElement {
    const tile = document.createElement("button");
    tile.className = "asset-tile";
    tile.title = title;
    tile.setAttribute("aria-label", title);
    tile.onclick = onPick;
    tile.appendChild(thumb);
    const lbl = document.createElement("span");
    lbl.className = "asset-name";
    lbl.textContent = key;
    tile.appendChild(lbl);
    if (onDelete) {
      const del = document.createElement("span");
      del.className = "asset-del";
      del.textContent = "×";
      del.setAttribute("aria-hidden", "true");
      tile.appendChild(del);
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        onDelete();
      });
    }
    return tile;
  }

  private renderAssets(): void {
    this.el.appendChild(this.renderDropzone());

    const userMedia = this.state.userAssets.filter((a) => a.kind !== "audio");
    if (userMedia.length) {
      const sec = document.createElement("div");
      sec.className = "project-section";
      sec.textContent = "Moje assety";
      this.el.appendChild(sec);
      const grid = document.createElement("div");
      grid.className = "asset-grid";
      for (const a of userMedia) {
        const thumb = document.createElement("span");
        thumb.className = "asset-thumb-wrap";
        if (a.kind === "image" && a.image) thumb.appendChild(imageThumb(a.image));
        else thumb.appendChild(this.badge(EXT_BADGE[ext(a.name)] ?? FILE_BADGE));
        grid.appendChild(
          this.assetTile(
            a.name,
            a.kind === "image"
              ? `${a.name} — tekstura ${a.w}×${a.h} (new GameLab.Sprite("${a.name}", w, h))`
              : `${a.name} — plik w assets/user/ (lab.readFile)`,
            thumb,
            () => this.cb.onAssetOpen(a),
            () => this.cb.onAssetDelete(a),
          ),
        );
      }
      this.el.appendChild(grid);
    }

    const groups = new Map<string, AssetEntry[]>();
    for (const a of this.state.engineAssets) {
      const cat = a.category ?? "inne";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(a);
    }
    for (const [cat, list] of groups) {
      const sec = document.createElement("div");
      sec.className = "project-section";
      sec.textContent = `Silnik · ${CATEGORY_LABELS[cat] ?? cat}`;
      this.el.appendChild(sec);
      const grid = document.createElement("div");
      grid.className = "asset-grid";
      for (const a of list) {
        grid.appendChild(
          this.assetTile(
            a.key,
            `${a.key} — ${a.frame.w}×${a.frame.h} (new GameLab.Sprite("${a.key}", w, h))`,
            spriteThumb(a),
            () => this.cb.onAssetOpen(a),
          ),
        );
      }
      this.el.appendChild(grid);
    }
  }

  private renderSounds(): void {
    this.el.appendChild(this.renderDropzone(true));

    const sec = document.createElement("div");
    sec.className = "project-section";
    sec.textContent = "Syntezator (nuty)";
    this.el.appendChild(sec);
    const notes = document.createElement("div");
    notes.className = "sound-grid";
    for (const n of SOUND_NOTES) {
      const b = document.createElement("button");
      b.className = "sound-chip";
      b.title = `${n} — odsłuch; this.audio.playNote("${n}")`;
      b.textContent = n;
      b.onclick = () => this.cb.onSoundPreview(n);
      notes.appendChild(b);
    }
    this.el.appendChild(notes);

    const audio = this.state.userAssets.filter((a) => a.kind === "audio");
    if (audio.length) {
      const sec2 = document.createElement("div");
      sec2.className = "project-section";
      sec2.textContent = "Moje dźwięki";
      this.el.appendChild(sec2);
      const ul = document.createElement("ul");
      ul.className = "pj-list";
      for (const a of audio) {
        const li = document.createElement("li");
        li.className = "pj-row";
        const btn = document.createElement("button");
        btn.className = "pj-name";
        btn.title = `${a.name} — this.sound.playSound("${a.name}")`;
        btn.onclick = () => this.cb.onSoundPreview(a);
        btn.append(this.badge(AUDIO_BADGE));
        const nm = document.createElement("span");
        nm.className = "pj-label";
        nm.textContent = a.name;
        btn.appendChild(nm);
        li.appendChild(btn);
        const actions = document.createElement("span");
        actions.className = "pj-actions";
        const del = document.createElement("button");
        del.className = "pj-action";
        del.title = "Usuń dźwięk";
        del.setAttribute("aria-label", `Usuń dźwięk: ${a.name}`);
        del.textContent = "×";
        del.onclick = (e) => {
          e.stopPropagation();
          this.cb.onAssetDelete(a);
        };
        actions.appendChild(del);
        li.appendChild(actions);
        ul.appendChild(li);
      }
      this.el.appendChild(ul);
    }
  }

  private renderFiles(): void {
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
  }

  private render(): void {
    this.langMenu?.remove();
    this.langMenu = null;
    this.el.replaceChildren();

    const head = document.createElement("div");
    head.className = "project-heading";
    const h = document.createElement("h3");
    h.textContent = "Projekt";
    const add = document.createElement("button");
    add.className = "pj-action pj-add";
    add.setAttribute("aria-label", "Dodaj");
    if (this.tab === "files") {
      add.title = "Nowy plik — wybierz język";
      add.onclick = () => this.renderLangMenu(add);
    } else {
      add.title = "Dodaj pliki (albo przeciągnij)";
      add.onclick = () => this.pickFiles();
    }
    add.textContent = "+";
    head.append(h, add);
    this.el.appendChild(head);
    this.el.appendChild(this.renderTabs());

    if (this.tab === "files") this.renderFiles();
    else if (this.tab === "assets") this.renderAssets();
    else this.renderSounds();
  }
}
