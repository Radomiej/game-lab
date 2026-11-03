// Edytor plików dźwięku projektu: .sfx (synth jednostrzałowy) i .song (sekwencer).
// Spec = JSON w pliku projektu; podgląd idzie przez createLabAudio (ten sam silnik co gra).
import { createLabAudio } from "../engine/audio.js";

export interface SfxSpec {
  kind: "sfx";
  wave: string;
  freq: number;
  slide: number;
  dur: number;
  attack: number;
  decay?: number;
  noise: number;
  filterFreq?: number;
  filterSlide?: number;
  volume: number;
}

export interface SeqNote {
  step: number;
  note: string;
  len: number;
}

export interface SongSpec {
  kind: "song";
  bpm: number;
  steps: number;
  wave: string;
  notes: SeqNote[];
}

const WAVES = ["square", "triangle", "sine", "sawtooth", "noise"];

// Presety synth — punkt startowy, każdy suwak edytowalny.
export const SFX_PRESETS: Array<{ label: string; spec: Omit<SfxSpec, "kind"> }> = [
  { label: "Wybuch", spec: { wave: "sawtooth", freq: 140, slide: -110, dur: 0.8, attack: 0.005, noise: 0.75, filterFreq: 1400, filterSlide: -1100, volume: 1 } },
  { label: "Deszcz", spec: { wave: "noise", freq: 0, slide: 0, dur: 2.2, attack: 0.5, noise: 1, filterFreq: 3200, filterSlide: -1200, volume: 0.5 } },
  { label: "Laser", spec: { wave: "square", freq: 980, slide: -860, dur: 0.16, attack: 0.002, noise: 0, volume: 0.6 } },
  { label: "Skok", spec: { wave: "square", freq: 280, slide: 520, dur: 0.22, attack: 0.004, noise: 0, volume: 0.5 } },
  { label: "Moneta", spec: { wave: "square", freq: 988, slide: 330, dur: 0.11, attack: 0.002, noise: 0, volume: 0.5 } },
  { label: "Uderzenie", spec: { wave: "triangle", freq: 190, slide: -140, dur: 0.14, attack: 0.002, noise: 0.45, volume: 0.9 } },
  { label: "Powerup", spec: { wave: "square", freq: 440, slide: 880, dur: 0.34, attack: 0.004, noise: 0.05, volume: 0.5 } },
  { label: "Alarm", spec: { wave: "sawtooth", freq: 620, slide: -160, dur: 0.55, attack: 0.01, noise: 0.12, volume: 0.5 } },
  { label: "Wiatr", spec: { wave: "noise", freq: 0, slide: 0, dur: 1.6, attack: 0.6, noise: 1, filterFreq: 900, filterSlide: 500, volume: 0.4 } },
  { label: "Splash", spec: { wave: "noise", freq: 0, slide: 0, dur: 0.4, attack: 0.01, noise: 0.9, filterFreq: 2200, filterSlide: -1600, volume: 0.7 } },
];

const NOTE_ROWS = (() => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const rows: string[] = [];
  for (let oct = 5; oct >= 3; oct--) for (let i = 11; i >= 0; i--) rows.push(`${names[i]}${oct}`);
  return rows;
})();

const DEFAULT_SFX: SfxSpec = { kind: "sfx", wave: "square", freq: 300, slide: -150, dur: 0.3, attack: 0.005, noise: 0.3, volume: 0.7 };
const DEFAULT_SONG: SongSpec = { kind: "song", bpm: 120, steps: 16, wave: "square", notes: [] };

type AudioKit = ReturnType<ReturnType<typeof createLabAudio>["createAudio"]>;

export class SoundEditor {
  private name = "";
  private spec: SfxSpec | SongSpec = DEFAULT_SFX;
  private readonly audio: AudioKit;
  private playing = false;
  private loopTimer: number | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly onSave: (name: string, text: string) => void,
  ) {
    this.audio = createLabAudio().createAudio({ window }) as AudioKit;
    this.el.classList.add("sound-editor");
  }

  get fileName(): string {
    return this.name;
  }

  open(name: string, text: string): void {
    this.stopPlayback();
    this.name = name;
    const fallback: SfxSpec | SongSpec = /\.sfx$/i.test(name) ? { ...DEFAULT_SFX } : { ...DEFAULT_SONG, notes: [] };
    try {
      const parsed = JSON.parse(text || "{}");
      this.spec = { ...fallback, ...parsed } as SfxSpec | SongSpec;
      if (this.spec.kind !== "sfx" && this.spec.kind !== "song") this.spec = fallback;
    } catch {
      this.spec = fallback;
    }
    this.render();
  }

  private save(): void {
    this.onSave(this.name, JSON.stringify(this.spec, null, 1));
  }

  private stopPlayback(): void {
    this.audio.stop();
    this.playing = false;
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  // ---- SFX: presety + suwaki ----

  private renderSfx(spec: SfxSpec): void {
    const wrap = document.createElement("div");
    wrap.className = "sfx-panel";

    const head = document.createElement("div");
    head.className = "se-head";
    head.innerHTML = `<span class="se-title">Synth SFX — ${this.name}</span>`;
    const play = document.createElement("button");
    play.className = "se-btn se-play";
    play.textContent = "▶ Odsłuch";
    play.onclick = () => this.audio.playSfx(spec, { volume: 0.8 });
    head.appendChild(play);
    wrap.appendChild(head);

    const pres = document.createElement("div");
    pres.className = "sfx-presets";
    for (const p of SFX_PRESETS) {
      const b = document.createElement("button");
      b.className = "sfx-preset";
      b.textContent = p.label;
      b.onclick = () => {
        Object.assign(spec, p.spec);
        this.save();
        this.render();
        this.audio.playSfx(spec, { volume: 0.8 });
      };
      pres.appendChild(b);
    }
    wrap.appendChild(pres);

    const grid = document.createElement("div");
    grid.className = "sfx-controls";

    const waveRow = document.createElement("label");
    waveRow.className = "sfx-ctrl";
    waveRow.innerHTML = `<span>Fala</span>`;
    const sel = document.createElement("select");
    for (const w of WAVES) {
      const o = document.createElement("option");
      o.value = w;
      o.textContent = w;
      o.selected = spec.wave === w;
      sel.appendChild(o);
    }
    sel.onchange = () => {
      spec.wave = sel.value;
      this.save();
    };
    waveRow.appendChild(sel);
    grid.appendChild(waveRow);

    const slider = (label: string, key: keyof SfxSpec, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const row = document.createElement("label");
      row.className = "sfx-ctrl";
      const val = document.createElement("span");
      val.className = "sfx-val";
      val.textContent = fmt(Number(spec[key] ?? 0));
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(spec[key] ?? 0);
      input.oninput = () => {
        (spec as unknown as Record<string, unknown>)[key] = Number(input.value);
        val.textContent = fmt(Number(input.value));
      };
      input.onchange = () => {
        this.save();
        this.audio.playSfx(spec, { volume: 0.8 });
      };
      row.innerHTML = `<span>${label}</span>`;
      row.append(input, val);
      grid.appendChild(row);
    };

    slider("Częstotliwość", "freq", 20, 2000, 1, (v) => `${v.toFixed(0)} Hz`);
    slider("Sweep", "slide", -1500, 1500, 1, (v) => `${v > 0 ? "+" : ""}${v.toFixed(0)} Hz`);
    slider("Czas", "dur", 0.05, 3, 0.01, (v) => `${v.toFixed(2)} s`);
    slider("Atak", "attack", 0.002, 1, 0.002, (v) => `${(v * 1000).toFixed(0)} ms`);
    slider("Szum", "noise", 0, 1, 0.01, (v) => `${(v * 100).toFixed(0)}%`);
    slider("Filtr LP", "filterFreq", 0, 8000, 10, (v) => (v ? `${v.toFixed(0)} Hz` : "wył."));
    slider("Sweep filtra", "filterSlide", -4000, 4000, 10, (v) => `${v > 0 ? "+" : ""}${v.toFixed(0)} Hz`);
    slider("Głośność", "volume", 0, 1, 0.01, (v) => `${(v * 100).toFixed(0)}%`);

    wrap.appendChild(grid);

    const hint = document.createElement("div");
    hint.className = "se-hint";
    hint.textContent = `w grze: this.sound.playSound("${this.name}")`;
    wrap.appendChild(hint);
    this.el.appendChild(wrap);
  }

  // ---- SONG: sekwencer ----

  private renderSong(spec: SongSpec): void {
    const has = (step: number, note: string) => spec.notes.some((n) => n.step === step && n.note === note);

    const head = document.createElement("div");
    head.className = "se-head";
    head.innerHTML = `<span class="se-title">Sekwencer — ${this.name}</span>`;

    const num = (label: string, val: number, min: number, max: number, fn: (v: number) => void) => {
      const l = document.createElement("label");
      l.className = "se-num";
      l.innerHTML = `<span>${label}</span>`;
      const i = document.createElement("input");
      i.type = "number";
      i.min = String(min);
      i.max = String(max);
      i.value = String(val);
      i.onchange = () => {
        const v = Math.max(min, Math.min(max, Number(i.value) || val));
        i.value = String(v);
        fn(v);
        this.save();
        this.render();
      };
      l.appendChild(i);
      return l;
    };
    head.appendChild(num("BPM", spec.bpm, 40, 300, (v) => (spec.bpm = v)));
    head.appendChild(num("Kroki", spec.steps, 4, 64, (v) => {
      spec.steps = v;
      spec.notes = spec.notes.filter((n) => n.step < v);
    }));

    const sel = document.createElement("select");
    for (const w of WAVES.filter((w) => w !== "noise")) {
      const o = document.createElement("option");
      o.value = w;
      o.textContent = w;
      o.selected = spec.wave === w;
      sel.appendChild(o);
    }
    sel.onchange = () => {
      spec.wave = sel.value;
      this.save();
    };
    head.appendChild(sel);

    const play = document.createElement("button");
    play.className = "se-btn se-play";
    play.textContent = this.playing ? "■ Stop" : "▶ Graj";
    play.onclick = () => {
      if (this.playing) {
        this.stopPlayback();
      } else {
        this.playing = true;
        play.textContent = "■ Stop";
        this.audio.playSeq(spec, { loop: true });
      }
    };
    head.appendChild(play);

    const clear = document.createElement("button");
    clear.className = "se-btn";
    clear.textContent = "Wyczyść";
    clear.onclick = () => {
      spec.notes = [];
      this.save();
      this.render();
    };
    head.appendChild(clear);
    this.el.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "se-grid";
    grid.style.gridTemplateColumns = `auto repeat(${spec.steps}, minmax(14px, 1fr))`;
    grid.setAttribute("role", "grid");
    for (const note of NOTE_ROWS) {
      const lab = document.createElement("div");
      lab.className = "se-note";
      lab.textContent = note;
      if (note.endsWith("4")) lab.classList.add("octave4");
      grid.appendChild(lab);
      for (let s = 0; s < spec.steps; s++) {
        const cell = document.createElement("button");
        cell.className = "se-cell";
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", `${note} krok ${s + 1}`);
        if (has(s, note)) cell.classList.add("on");
        if (s % 4 === 0) cell.classList.add("beat");
        cell.onclick = () => {
          const i = spec.notes.findIndex((n) => n.step === s && n.note === note);
          if (i >= 0) spec.notes.splice(i, 1);
          else spec.notes.push({ step: s, note, len: 1 });
          cell.classList.toggle("on");
          this.save();
          if (!this.playing) this.audio.playNote(note, { wave: spec.wave, beats: 0.3 });
        };
        grid.appendChild(cell);
      }
    }
    this.el.appendChild(grid);

    const hint = document.createElement("div");
    hint.className = "se-hint";
    hint.textContent = `w grze: this.sound.playSound("${this.name}", { loop: true })`;
    this.el.appendChild(hint);
  }

  private render(): void {
    this.el.replaceChildren();
    if (this.spec.kind === "sfx") this.renderSfx(this.spec);
    else this.renderSong(this.spec);
  }
}
