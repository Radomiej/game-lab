export const gameAudioRuntimeFiles = {
  "Notes.java": `package engine;

public final class Notes {
    private Notes() {}
    static void checkNote(String note) {
        if (note == null) throw new IllegalArgumentException("Nuta nie moze byc pusta");
        String t = note.trim();
        if (t.equals("-") || t.equalsIgnoreCase("r")) return;
        if (t.length() < 2 || t.length() > 4) throw new IllegalArgumentException("Nieznana nuta: " + note);
        char letter = Character.toLowerCase(t.charAt(0));
        if (letter < 'a' || letter > 'g') throw new IllegalArgumentException("Nieznana nuta: " + note);
        int i = 1;
        if (t.charAt(1) == '#' || t.charAt(1) == 'b') i = 2;
        String octave = t.substring(i);
        if (octave.isEmpty()) throw new IllegalArgumentException("Nieznana nuta: " + note);
        try { Integer.parseInt(octave); } catch (NumberFormatException e) { throw new IllegalArgumentException("Nieznana nuta: " + note); }
    }
    static void checkWave(String wave) {
        if (!"square".equals(wave) && !"triangle".equals(wave) && !"sine".equals(wave) && !"sawtooth".equals(wave) && !"noise".equals(wave))
            throw new IllegalArgumentException("Nieznana fala: " + wave);
    }
    static void checkBeats(double beats) {
        if (!Double.isFinite(beats) || beats <= 0) throw new IllegalArgumentException("Czas musi byc dodatnia liczba taktow");
    }
    static void checkTempo(double tempo) {
        if (!Double.isFinite(tempo) || tempo <= 0) throw new IllegalArgumentException("Tempo musi byc dodatnim BPM");
    }
    static String quote(String text) {
        return "\\"" + text.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"") + "\\"";
    }
}
`,
  "Sequencer.java": `package engine;

import java.util.ArrayList;

/** Jedna ścieżka utworu: fala syntezatora i lista nut w taktach. */
public final class Sequencer {
    private final String wave;
    private final ArrayList<String> steps = new ArrayList<>();
    Sequencer(String wave) { Notes.checkWave(wave); this.wave = wave; }
    public Sequencer note(String name) { return note(name, 1); }
    public Sequencer note(String name, double beats) {
        Notes.checkNote(name);
        Notes.checkBeats(beats);
        String t = name.trim();
        steps.add((t.equalsIgnoreCase("r") ? "-" : t) + "|" + beats);
        return this;
    }
    public Sequencer rest() { return rest(1); }
    public Sequencer rest(double beats) {
        Notes.checkBeats(beats);
        steps.add("|" + beats);
        return this;
    }
    public Sequencer notes(String phrase) {
        if (phrase == null) throw new IllegalArgumentException("Fraza to tekst, np. \\"C4:1 E4:0.5 -:2\\"");
        boolean any = false;
        int i = 0, n = phrase.length();
        while (i < n) {
            while (i < n && Character.isWhitespace(phrase.charAt(i))) i++;
            int j = i;
            while (j < n && !Character.isWhitespace(phrase.charAt(j))) j++;
            if (j > i) {
                any = true;
                String token = phrase.substring(i, j);
                int colon = token.lastIndexOf(':');
                if (colon < 0) note(token, 1);
                else note(token.substring(0, colon), parseBeats(token.substring(colon + 1), token));
            }
            i = j;
        }
        if (!any) throw new IllegalArgumentException("Fraza to tekst, np. \\"C4:1 E4:0.5 -:2\\"");
        return this;
    }
    private static double parseBeats(String text, String token) {
        try { return Double.parseDouble(text); } catch (NumberFormatException e) { throw new IllegalArgumentException("Niepoprawny krok melodii: " + token); }
    }
    public double duration() {
        double sum = 0;
        for (String step : steps) sum += Double.parseDouble(step.substring(step.lastIndexOf('|') + 1));
        return sum;
    }
    String toJson() {
        StringBuilder out = new StringBuilder();
        out.append("{\\"wave\\":").append(Notes.quote(wave)).append(",\\"notes\\":[");
        for (int i = 0; i < steps.size(); i++) {
            if (i > 0) out.append(',');
            String step = steps.get(i);
            int bar = step.lastIndexOf('|');
            String name = step.substring(0, bar);
            out.append("{\\"note\\":").append(name.isEmpty() || name.equals("-") ? "null" : Notes.quote(name)).append(",\\"beats\\":").append(step.substring(bar + 1)).append('}');
        }
        return out.append("]}").toString();
    }
}
`,
  "Song.java": `package engine;

import java.util.ArrayList;

/** Utwór: tempo w BPM i sekwencery (równoległe ślady syntezatora). */
public final class Song {
    private final double tempo;
    private final ArrayList<Sequencer> tracks = new ArrayList<>();
    public Song() { this(120); }
    public Song(double tempo) { Notes.checkTempo(tempo); this.tempo = tempo; }
    public Sequencer sequencer() { return sequencer("square"); }
    public Sequencer sequencer(String wave) {
        Sequencer seq = new Sequencer(wave);
        tracks.add(seq);
        return seq;
    }
    public double getTempo() { return tempo; }
    public int trackCount() { return tracks.size(); }
    public String toJson() {
        StringBuilder out = new StringBuilder();
        out.append("{\\"tempo\\":").append(tempo).append(",\\"tracks\\":[");
        for (int i = 0; i < tracks.size(); i++) {
            if (i > 0) out.append(',');
            out.append(tracks.get(i).toJson());
        }
        return out.append("]}").toString();
    }
}
`,
  "Audio.java": `package engine;

/** Fasada dźwięku: serializuje komendy do ramki; synteza dzieje się w przeglądarce. */
public final class Audio {
    Audio() {}

    public void playNote(String note) { playNote(note, 1); }
    public void playNote(String note, double beats) { playNote(note, beats, "square"); }
    public void playNote(String note, double beats, String wave) {
        Notes.checkNote(note);
        Notes.checkWave(wave);
        Notes.checkBeats(beats);
        GameCanvas.emitAudio("{\\"cmd\\":\\"note\\",\\"note\\":" + Notes.quote(note.trim()) + ",\\"beats\\":" + beats + ",\\"wave\\":" + Notes.quote(wave) + "}");
    }
    public void play(Song song) { play(song, false); }
    public void play(Song song, boolean loop) {
        if (song == null) throw new IllegalArgumentException("Wymagany Song");
        GameCanvas.emitAudio("{\\"cmd\\":\\"song\\",\\"loop\\":" + loop + ",\\"song\\":" + song.toJson() + "}");
    }
    public void stop() { GameCanvas.emitAudio("{\\"cmd\\":\\"stop\\"}"); }
}
`,
};
