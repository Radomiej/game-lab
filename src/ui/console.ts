// Konsola w tej samej formie i API co RuntimeConsole z java-lab /
// web-learning-lab: sekcja z nagłówkiem + pill statusu, linie
// .console-line--{log|sys|warn|error}, placeholder dla pustego stanu.
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

export class RuntimeConsole {
  private empty = true;

  constructor(
    private readonly el: HTMLElement,
    private readonly pill: HTMLElement,
  ) {
    this.clear();
  }

  setStatus(status: ConsoleStatus): void {
    this.pill.className = `runtime-pill runtime-pill--${status}`;
    this.pill.textContent = STATUS_LABEL[status];
  }

  clear(): void {
    this.el.replaceChildren();
    const ph = document.createElement("span");
    ph.className = "console-placeholder";
    ph.textContent = PLACEHOLDER;
    this.el.appendChild(ph);
    this.empty = true;
  }

  /** Strumieniowy zapis — tekst może zawierać wiele linii lub ich kawałki. */
  write(level: ConsoleLevel, text: string): void {
    if (!text) return;
    if (this.empty) {
      this.el.replaceChildren();
      this.empty = false;
    }
    const span = document.createElement("span");
    span.className = `console-line console-line--${level}`;
    if (level !== "sys") {
      const pfx = document.createElement("span");
      pfx.className = "pfx";
      pfx.textContent = PREFIX[level];
      span.appendChild(pfx);
    }
    span.appendChild(document.createTextNode(text));
    this.el.appendChild(span);
    this.el.scrollTop = this.el.scrollHeight;
  }
}
