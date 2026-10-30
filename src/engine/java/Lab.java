package engine;

/**
 * Lab - most do wspolnej sceny lab-core (WorldRegistry) spoza silnika Java.
 *
 * Architektura: worker TeaVM nie moze wywolac JS synchronicznie, dlatego
 *  - ZAPISY (spawn/setProp/setPosition/attachXxx/call/destroy) ida przez strumien
 *    klatki (drain() doklejany do GameCanvas.frame()) - host aplikuje je
 *    w kolejnosci emisji w TEJ SAMEJ klatce: obserwowalnie synchroniczne.
 *  - ODCZYTY (getProp/getNum/findComponent/getX/getY) czytaja snapshot swiata
 *    pchany do Javy co klatke - lokalny odczyt, <=1 klatka swiezosci.
 *  - call() zwraca callId; wynik dochodzi nastepna klatka przez pollResult().
 *
 * Handle: spawn() zwraca token klienta (liczba ujemna) - host mapuje go na
 * prawdziwe id obiektu; token dziala jak kazdy inny handle w metodach Lab.
 */
public final class Lab {
    private Lab() {}

    private static final StringBuilder ops = new StringBuilder(4096);
    private static int nextToken = -1;
    private static int nextCallId = 1;
    private static int worldRev = -1;
    private static String worldRaw = "";
    private static String[] worldLines = new String[0];
    private static String callResults = "";

    /** Eksport - GameLauncher dokleja odczytane ops do GameCanvas.frame(). */
    public static String drain() {
        String s = ops.toString();
        ops.setLength(0);
        return s;
    }

    /** Eksport - snapshot swiata: linie "kind|a|b|..."; rev = numer klatki. */
    public static void setWorldState(String raw, int rev) {
        if (rev <= worldRev) return;
        worldRev = rev;
        worldRaw = raw == null ? "" : raw;
        worldLines = worldRaw.isEmpty() ? new String[0] : worldRaw.split("\n");
    }

    private static void emit(String line) {
        ops.append("lab|").append(line).append('\n');
    }
    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("|", "\\p").replace("\n", " ");
    }

    // ---- zapisy (kolejnosc = kolejnosc aplikacji po stronie hosta) ----

    /** Wspolny GameObject. Zwraca token klienta (handle do Lab.*). */
    public static int spawn(String name) {
        int t = nextToken--;
        emit("spawn|" + t + "|" + esc(name));
        return t;
    }

    public static void destroyObject(int handle) {
        emit("destroy|" + handle);
    }

    /** Komponent Java na wspolnym obiekcie - zwraca token komponentu.
     *  Pola publikuj do inspektora przez pushProp(). */
    public static int attachComponent(int objectHandle, String kind) {
        int t = nextToken--;
        emit("attachComponent|" + t + "|" + objectHandle + "|" + esc(kind));
        return t;
    }

    /** specJson np. {"type":"sprite","texture":"slime","width":48,"height":48}. */
    public static void attachRenderer(int objectHandle, String specJson) {
        emit("attachRenderer|" + objectHandle + "|" + esc(specJson));
    }

    public static void setPosition(int objectHandle, double x, double y) {
        emit("setPosition|" + objectHandle + "|" + x + "|" + y);
    }

    /** Zapis pola komponentu (dowolny jezyk lub komponent Java). */
    public static void setProp(int compHandle, String prop, String value) {
        emit("set|" + compHandle + "|" + esc(prop) + "|" + esc(value));
    }

    public static void setNum(int compHandle, String prop, double value) {
        setProp(compHandle, prop, Double.toString(value));
    }

    /** Publikacja pola komponentu Java do hierarchii/inspektora IDE. */
    public static void pushProp(int compHandle, String name, String value) {
        emit("push|" + compHandle + "|" + esc(name) + "|" + esc(value));
    }

    /** Wywolanie metody komponentu innego jezyka. Wynik: pollResult(callId). */
    public static int call(int compHandle, String method, String argsJson) {
        int id = nextCallId++;
        emit("call|" + id + "|" + compHandle + "|" + esc(method) + "|" + esc(argsJson == null ? "[]" : argsJson));
        return id;
    }

    // ---- odczyty (snapshot swiata z ostatniej klatki) ----

    /** Handle komponentu danego typu (0 = brak). */
    public static int findComponent(String kind) {
        for (String l : worldLines) {
            if (l.startsWith("comp|")) {
                String[] p = l.split("\\|");
                if (p.length >= 5 && p[4].equals(kind)) return Integer.parseInt(p[1]);
            }
        }
        return 0;
    }

    /** Pole komponentu z snapshotu - "" gdy brak. */
    public static String getProp(int compId, String prop) {
        String prefix = "prop|" + compId + "|" + prop + "|";
        for (String l : worldLines) {
            if (l.startsWith(prefix)) return l.substring(prefix.length());
        }
        return "";
    }

    public static double getNum(int compId, String prop) {
        try {
            String s = getProp(compId, prop);
            return s.isEmpty() ? 0 : Double.parseDouble(s);
        } catch (Exception e) {
            return 0;
        }
    }

    public static double getX(int objectHandle) {
        String prefix = "pos|" + objectHandle + "|";
        for (String l : worldLines) {
            if (l.startsWith(prefix)) {
                String[] p = l.split("\\|");
                return p.length >= 3 ? Double.parseDouble(p[2]) : 0;
            }
        }
        return 0;
    }

    public static double getY(int objectHandle) {
        String prefix = "pos|" + objectHandle + "|";
        for (String l : worldLines) {
            if (l.startsWith(prefix)) {
                String[] p = l.split("\\|");
                return p.length >= 4 ? Double.parseDouble(p[3]) : 0;
            }
        }
        return 0;
    }

    /** Token -> prawdziwe id obiektu (0 gdy host jeszcze nie zmapowal). */
    public static int resolveId(int token) {
        String prefix = "spawned|" + token + "|";
        for (String l : worldLines) {
            if (l.startsWith(prefix)) return Integer.parseInt(l.substring(prefix.length()));
        }
        return 0;
    }

    /** Wynik call() - "" gdy jeszcze nie doszedl (sprawdzaj co klatke). */
    public static String pollResult(int callId) {
        String prefix = "callres|" + callId + "|";
        int idx = callResults.indexOf(prefix);
        if (idx < 0) return "";
        int end = callResults.indexOf('\n', idx);
        return callResults.substring(idx + prefix.length(), end < 0 ? callResults.length() : end);
    }

    /** Eksport - wyniki wywolan metod (linie callres|id|json). */
    public static void setCallResults(String raw) {
        callResults = raw == null ? "" : raw;
    }
}
