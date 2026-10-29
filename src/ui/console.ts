// Konsola w tej samej formie i API co RuntimeConsole z java-lab /
// web-learning-lab: sekcja z nagłówkiem + pill statusu, linie
// .console-line--{log|sys|warn|error}, placeholder dla pustego stanu.
// Feature'y sportowane z labów:
//  - "Pokaż białe znaki" (ConsoleOutput z java-lab): · spacja, ⇥ tab, ↵ enter
//  - kopiowanie wyniku (wzorzec CopyCodeButton z shared/lab-game-v2)
//  - czyszczenie konsoli
// Dodatkowo: strumieniowy write() jako zlew dla hosta (LabHost.stdout/stderr).
export type ConsoleStatus = "idle" | "loading" | "running" | "ready" | "error";
export type ConsoleLevel = "log" | "sys" | "warn" | "error";

const STATUS_LABEL: Record<ConsoleStatus, string> = {
  idle: "Czeka",
  loading: "Ładuję",
  running: "Działa",
  ready: "Gotowe",
  error: "Błąd",
};

const PLACEHOLDER = "Uruchom kod, aby zobaczyć wynik programu lub błędy.";
const PREFIX: Record<Exclude<ConsoleLevel, "sys">, string> = {
  log: "> ",
  warn: "⚠ ",
  error: "Błąd: ",
};

interface Chunk {
  level: ConsoleLevel;
  text: string;
}

// jak ConsoleOutput z java-lab: spacja→·, tab→⇥, nowa linia→↵
const revealWhitespace = (text: string) =>
  text.replace(/ /g, "·").replace(/\t/g, "⇥").replace(/\n/g, "↵\n");

export class RuntimeConsole {
  private chunks: Chunk[] = [];
  private rendered = 0;
  private whitespace = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly pill: HTMLElement,
  ) {
    this.render();
  }

  setStatus(status: ConsoleStatus): void {
    this.pill.className = `runtime-pill runtime-pill--${status}`;
    this.pill.textContent = STATUS_LABEL[status];
  }

  clear(): void {
    this.chunks = [];
    this.render();
  }

  /** Surowy tekst konsoli (do schowka). */
  getText(): string {
    return this.chunks.map((c) => (c.level === "sys" ? c.text : PREFIX[c.level] + c.text)).join("");
  }

  /** Toggle "Pokaż białe znaki" — zwraca nowy stan. */
  toggleWhitespace(): boolean {
    this.whitespace = !this.whitespace;
    this.render(true);
    return this.whitespace;
  }

  /** Strumieniowy zapis — tekst może zawierać wiele linii lub ich kawałki. */
  write(level: ConsoleLevel, text: string): void {
    if (!text) return;
    this.chunks.push({ level, text });
    this.render();
  }

  private lineEl({ level, text }: Chunk): HTMLElement {
    const span = document.createElement("span");
    span.className = `console-line console-line--${level}`;
    if (level !== "sys") {
      const pfx = document.createElement("span");
      pfx.className = "pfx";
      pfx.textContent = PREFIX[level];
      span.appendChild(pfx);
    }
    span.appendChild(document.createTextNode(this.whitespace ? revealWhitespace(text) : text));
    return span;
  }

  private render(rebuild = false): void {
    if (rebuild || this.rendered > this.chunks.length) {
      this.el.replaceChildren();
      this.rendered = 0;
    }
    if (!this.chunks.length) {
      this.el.replaceChildren();
      const ph = document.createElement("span");
      ph.className = "console-placeholder";
      ph.textContent = PLACEHOLDER;
      this.el.appendChild(ph);
      this.rendered = 0;
      return;
    }
    if (this.rendered === 0) this.el.replaceChildren();
    for (; this.rendered < this.chunks.length; this.rendered++) {
      this.el.appendChild(this.lineEl(this.chunks[this.rendered]));
    }
    this.el.scrollTop = this.el.scrollHeight;
  }
}
