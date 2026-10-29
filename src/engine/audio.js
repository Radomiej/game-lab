/**
 * Synteza dźwięku WebAudio współdzielona przez GameLab JS i Javę (TeaVM).
 * createLabAudio() jest samowystarczalna: serializowana przez toString() do iframe,
 * więc nie może korzystać z importów ani stanu modułu.
 */
export function createLabAudio() {
  const SEMITONES = { c: 0, 'c#': 1, db: 1, d: 2, 'd#': 3, eb: 3, e: 4, f: 5, 'f#': 6, gb: 6, g: 7, 'g#': 8, ab: 8, a: 9, 'a#': 10, bb: 10, b: 11 };
  const WAVES = ['square', 'triangle', 'sine', 'sawtooth', 'noise'];

  /** "C4" -> 60, "C#4"/"Db4" -> 61, "-"/"R" -> null (pauza). */
  function parseNote(text) {
    if (text === null || text === undefined) throw new Error('Nuta nie może być pusta.');
    const token = String(text).trim();
    if (token === '-' || token.toLowerCase() === 'r') return null;
    const match = /^([A-Ga-g])(#|b)?(-?\d+)$/.exec(token);
    const semitone = match ? SEMITONES[match[1].toLowerCase() + (match[2] || '')] : undefined;
    if (semitone === undefined) throw new Error(`Nieznana nuta: ${text}`);
    const midi = (Number(match[3]) + 1) * 12 + semitone;
    if (midi < 0 || midi > 127) throw new Error(`Nuta poza zakresem MIDI: ${text}`);
    return midi;
  }

  function midiToHz(midi) {
    if (!Number.isFinite(midi)) throw new Error('Numer MIDI musi być liczbą.');
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function checkWave(wave) {
    if (!WAVES.includes(wave)) throw new Error(`Fala musi być jedną z: ${WAVES.join(', ')}.`);
    return wave;
  }
  function checkBeats(beats) {
    if (!Number.isFinite(beats) || beats <= 0) throw new Error('Czas musi być dodatnią liczbą taktów.');
    return beats;
  }
  function checkTempo(tempo) {
    if (!Number.isFinite(tempo) || tempo <= 0) throw new Error('Tempo musi być dodatnim BPM.');
    return tempo;
  }

  /** "C4:1 E4:0.5 -:2" -> [{note:"C4",beats:1},{note:"E4",beats:0.5},{note:null,beats:2}] */
  function parsePhrase(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Fraza to tekst, np. "C4:1 E4:0.5 -:2".');
    return text.trim().split(/\s+/).map(token => {
      const parts = token.split(':');
      if (parts.length > 2) throw new Error(`Niepoprawny krok melodii: ${token}`);
      const beats = parts[1] === undefined ? 1 : checkBeats(Number(parts[1]));
      return { note: parseNote(parts[0]) === null ? null : parts[0], beats };
    });
  }

  class Sequencer {
    constructor(wave = 'square') {
      this.wave = checkWave(wave);
      this.steps = [];
    }
    note(name, beats = 1) {
      parseNote(name);
      this.steps.push({ note: String(name).trim(), beats: checkBeats(beats) });
      return this;
    }
    rest(beats = 1) {
      this.steps.push({ note: null, beats: checkBeats(beats) });
      return this;
    }
    notes(text) {
      for (const step of parsePhrase(text)) {
        if (step.note === null) this.rest(step.beats);
        else this.note(step.note, step.beats);
      }
      return this;
    }
    duration() { return this.steps.reduce((sum, step) => sum + step.beats, 0); }
    toJSON() { return { wave: this.wave, notes: this.steps.map(step => ({ note: step.note, beats: step.beats })) }; }
  }

  class Song {
    constructor(tempo = 120) {
      this.tempo = checkTempo(tempo);
      this.tracks = [];
    }
    sequencer(wave = 'square') {
      const seq = new Sequencer(wave);
      this.tracks.push(seq);
      return seq;
    }
    duration() { return this.tracks.reduce((max, track) => Math.max(max, track.duration()), 0); }
    toJSON() { return { tempo: this.tempo, tracks: this.tracks.map(track => track.toJSON()) }; }
  }

  /** Song | {tempo, tracks:[{wave, notes|steps:[{note|"C4"|midi, beats}]}]} -> {tempo, tracks:[{wave, notes:[{midi|null, beats}]}]} */
  function normalizeSong(data) {
    if (!data || typeof data !== 'object') throw new Error('Wymagany obiekt Song.');
    const tempo = checkTempo(Number(data.tempo));
    const tracks = (data.tracks || []).map(track => ({
      wave: checkWave(track.wave || 'square'),
      notes: (track.steps || track.notes || []).map(step => ({
        midi: typeof step.midi === 'number' ? step.midi : (step.note === null || step.note === undefined ? null : parseNote(step.note)),
        beats: checkBeats(Number(step.beats)),
      })),
    }));
    return { tempo, tracks };
  }

  function songBeats(song) {
    return song.tracks.reduce((max, track) => Math.max(max, track.notes.reduce((sum, note) => sum + note.beats, 0)), 0);
  }

  function createAudio(environment = {}) {
    const win = environment.window || (typeof window !== 'undefined' ? window : undefined);
    const setTimer = environment.setTimeout || ((fn, ms) => win.setTimeout(fn, ms));
    const clearTimer = environment.clearTimeout || (id => win.clearTimeout(id));
    let context = null, master = null, sources = new Set(), loopTimer = null, warned = false, noise = null;

    function ensure() {
      if (context) return context;
      const AudioCtor = environment.AudioContext || win?.AudioContext || win?.webkitAudioContext;
      if (!AudioCtor) {
        if (!warned) { warned = true; (win?.console ?? console).warn('Brak AudioContext — dźwięk jest wyłączony.'); }
        return null;
      }
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      return context;
    }

    function noiseSource(ctx) {
      if (!noise || noise.context !== ctx) {
        const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        noise = { context: ctx, buffer };
      }
      const source = ctx.createBufferSource();
      source.buffer = noise.buffer;
      source.loop = true;
      return source;
    }

    function tone(midi, at, seconds, wave, volume) {
      const osc = wave === 'noise' ? noiseSource(context) : context.createOscillator();
      const gain = context.createGain();
      if (wave !== 'noise') { osc.type = wave; osc.frequency.setValueAtTime(midiToHz(midi), at); }
      const end = at + Math.max(0.02, seconds);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), at + 0.015);
      gain.gain.setValueAtTime(volume, at + Math.max(0.015, seconds * 0.7));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(master);
      osc.start(at);
      osc.stop(end + 0.05);
      sources.add(osc);
      osc.onended = () => sources.delete(osc);
    }

    function playNote(note, { wave = 'square', beats = 1, tempo = 120, volume = 0.6 } = {}) {
      const midi = parseNote(note);
      if (midi === null || !ensure()) return;
      context.resume?.();
      tone(midi, context.currentTime + 0.03, checkBeats(beats) * 60 / checkTempo(tempo), checkWave(wave), volume);
    }

    function playSong(song, { loop = false, volume = 0.6 } = {}) {
      const normalized = normalizeSong(song instanceof Song ? song.toJSON() : song);
      if (!ensure()) return;
      stop();
      context.resume?.();
      const secondsPerBeat = 60 / normalized.tempo;
      const start = context.currentTime + 0.05;
      for (const track of normalized.tracks) {
        let cursor = 0;
        for (const step of track.notes) {
          if (step.midi !== null) tone(step.midi, start + cursor * secondsPerBeat, step.beats * secondsPerBeat, track.wave, volume);
          cursor += step.beats;
        }
      }
      const totalBeats = songBeats(normalized);
      if (loop && totalBeats > 0) loopTimer = setTimer(() => playSong(normalized, { loop: true, volume }), totalBeats * secondsPerBeat * 1000);
    }

    function stop() {
      if (loopTimer !== null) { clearTimer(loopTimer); loopTimer = null; }
      for (const source of sources) { try { source.stop(); } catch { /* już zatrzymane */ } }
      sources.clear();
    }

    function dispose() {
      stop();
      context?.close?.()?.catch?.(() => {});
      context = null; master = null; noise = null;
    }

    function resume() { if (ensure() && context.state === 'suspended') context.resume(); }

    function bindGestures(target = win) {
      if (!target?.addEventListener) return;
      target.addEventListener('pointerdown', resume);
      target.addEventListener('keydown', resume);
    }

    return { playNote, play: playSong, playSong, stop, dispose, resume, bindGestures };
  }

  return { parseNote, midiToHz, normalizeSong, Song, Sequencer, createAudio };
}
