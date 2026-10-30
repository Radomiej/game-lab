// Port src/services/gameWorkspace.js z java-lab.
// Pakowanie plików gry: kod ucznia → pakiet `lab` + `import engine.*`,
// silnik → pakiet `engine`, GameLauncher → most @JSExport worker↔Java.

import { gameEngineRuntimeFiles } from "./gameEngineRuntime.js";
import labJavaSource from "./Lab.java?raw";

const GAME_CLASS = /\bclass\s+(\w+)\s+extends\s+Game\b/;
const MAIN_METHOD = /\bpublic\s+static\s+void\s+main\s*\(/;
const PACKAGE_DECL = /^\s*package\s+([\w.]+)\s*;/m;

/** Pliki edytora: bez Main.java/GameLauncher.java i bez nadpisywania silnika. */
export function gameEditorFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files)
      .filter(
        ([name]) =>
          name !== "Main.java" &&
          name !== "GameLauncher.java" &&
          !Object.hasOwn(gameEngineRuntimeFiles, name) &&
          !(name === "StudentGame.java" && Object.hasOwn(files, "GameMain.java")),
      )
      .map(([name, source]) => [
        name === "StudentGame.java" ? "GameMain.java" : name,
        source
          .replace(/\bStudentGame\b/g, "GameMain")
          .replace(/^\s*import engine\.[\w*]+;\s*$/gm, "")
          .trimStart(),
      ]),
  );
}

const launcher = `package lab;
import engine.*;
import org.teavm.jso.JSExport;
public class GameLauncher {
    private static GameMain game;
    public static void main(String[] args) { game = new GameMain(); game.start(); }
    @JSExport public static void tick(double delta) { game.step(delta); }
    @JSExport public static String frame() { return GameCanvas.frame() + Lab.drain(); }
    @JSExport public static void setWorldState(String raw, int rev) { Lab.setWorldState(raw, rev); }
    @JSExport public static void setCallResults(String raw) { Lab.setCallResults(raw); }
    @JSExport public static void setKey(String key, boolean pressed) { game.input.setKey(key, pressed); }
    @JSExport public static void setPointer(double x,double y) { game.input.setPointer(x,y); }
    @JSExport public static void setMouseButton(int button,boolean pressed) { game.input.setMouseButton(button,pressed); }
    @JSExport public static void clearInput() { game.input.clear(); }
    @JSExport public static void resize(double width, double height) { GameCanvas.setSize(width, height); }
    @JSExport public static void dispose() { game.dispose(); }
    @JSExport public static void setDebug(boolean enabled) { game.debug = enabled; }
}
`;

export interface PreparedRun {
  files: Record<string, string>;
  mainClass: string;
  mode?: "game";
}

function findGameClass(files: Record<string, string>, entry: string): { file: string; name: string } | null {
  const ordered = [entry, ...Object.keys(files).filter((f) => f !== entry)];
  for (const file of ordered) {
    if (!file.endsWith(".java")) continue;
    const match = GAME_CLASS.exec(files[file] ?? "");
    if (match) return { file, name: match[1] };
  }
  return null;
}

function mainClassFor(files: Record<string, string>, entry: string): string {
  let file = entry;
  if (!files[file]) {
    file = [entry, ...Object.keys(files)].find((f) => f.endsWith(".java") && MAIN_METHOD.test(files[f] ?? "")) ?? entry;
  }
  const className = file.replace(/\.java$/, "");
  const pkg = PACKAGE_DECL.exec(files[file] ?? "")?.[1];
  return pkg ? `${pkg}.${className}` : className;
}

/**
 * Przygotowuje request dla workera TeaVM.
 * Tryb gry: wykryta klasa `extends Game` → GameMain, kod ucznia w pakiecie lab,
 * dołączony silnik engine.* i GameLauncher. Tryb konsoli: pliki bez zmian.
 */
export function prepareGameRequest(files: Record<string, string>, entry: string): PreparedRun {
  const game = findGameClass(files, entry);
  if (!game) return { files, mainClass: mainClassFor(files, entry) };

  const out: Record<string, string> = { ...gameEngineRuntimeFiles, "Lab.java": labJavaSource };
  for (const [name, source] of Object.entries(gameEditorFiles(files))) {
    if (!name.endsWith(".java")) continue;
    // Klasa gry normalizowana do GameMain (konwencja GameLauncher + java-lab).
    let renamed = name;
    let code = source;
    if (game.name !== "GameMain") {
      const pattern = new RegExp(`\\b${game.name}\\b`, "g");
      code = code.replace(pattern, "GameMain");
      if (name === game.file) renamed = "GameMain.java";
    }
    const declaration = PACKAGE_DECL.exec(code);
    if (declaration && declaration[1] !== "lab") {
      throw new Error(`Pliki gry używają wspólnego pakietu lab. Usuń deklarację package z ${name}.`);
    }
    out[renamed] = `package lab;\nimport engine.*;\n${code.replace(/^\s*package\s+lab\s*;/m, "")}`;
  }
  if (!out["GameMain.java"]) {
    throw new Error("Nie znaleziono klasy gry — plik z `class … extends Game` musi istnieć.");
  }
  out["GameLauncher.java"] = launcher;
  return { files: out, mainClass: "lab.GameLauncher", mode: "game" };
}
