export interface LabExample {
  id: string;
  label: string;
  runtime: string;
  files: Record<string, string>;
  entry: string;
  stdin?: string;
}

const raw = import.meta.glob<string>("./files/*", { query: "?raw", import: "default", eager: true });
const content = (path: string) => raw[`./files/${path}`]!;

export const examples: LabExample[] = [
  {
    id: "js-playground",
    label: "Playground",
    runtime: "javascript",
    entry: "main.js",
    files: {
      "main.js": content("pg-main.js"),
      "helpers.js": content("pg-helpers.js"),
      "assets/palette.json": content("pg-palette.json"),
    },
  },
  {
    id: "js-labgame",
    label: "Gra: silnik labów (LAB·BOY)",
    runtime: "javascript",
    entry: "main.js",
    files: { "main.js": content("js-labgame.js") },
  },
  {
    id: "js-game",
    label: "Gra: monety",
    runtime: "javascript",
    entry: "main.js",
    files: { "main.js": content("js-game.js") },
  },
  {
    id: "js-interop",
    label: "Gra: interop (JS <- Lua/Py)",
    runtime: "javascript",
    entry: "main.js",
    files: { "main.js": content("js-interop.js") },
  },
  {
    id: "js-console",
    label: "Konsola",
    runtime: "javascript",
    entry: "main.js",
    files: { "main.js": content("js-console.js") },
    stdin: "Uczeń",
  },
  {
    id: "ts-game",
    label: "Gra: odbicia",
    runtime: "typescript",
    entry: "main.ts",
    files: { "main.ts": content("ts-game.ts") },
  },
  {
    id: "lua-game",
    label: "Gra: kulka",
    runtime: "lua",
    entry: "main.lua",
    files: { "main.lua": content("lua-game.lua") },
  },
  {
    id: "lua-ai",
    label: "Interop: komponent Chaser",
    runtime: "lua",
    entry: "main.lua",
    files: { "main.lua": content("lua-ai.lua") },
  },
  {
    id: "lua-console",
    label: "Konsola",
    runtime: "lua",
    entry: "main.lua",
    files: { "main.lua": content("lua-console.lua") },
    stdin: "Uczeń",
  },
  {
    id: "py-game",
    label: "Gra: kwadrat",
    runtime: "python",
    entry: "main.py",
    files: { "main.py": content("py-game.py") },
  },
  {
    id: "py-ai",
    label: "Interop: komponent Wanderer",
    runtime: "python",
    entry: "main.py",
    files: { "main.py": content("py-ai.py") },
  },
  {
    id: "py-console",
    label: "Konsola",
    runtime: "python",
    entry: "main.py",
    files: { "main.py": content("py-console.py") },
  },
  {
    id: "cpp-console",
    label: "Konsola",
    runtime: "cpp",
    entry: "main.cpp",
    files: { "main.cpp": content("cpp-console.cpp") },
  },
  {
    id: "java-game",
    label: "Gra: monety (TeaVM)",
    runtime: "java",
    entry: "GameMain.java",
    files: { "GameMain.java": content("java-game.java") },
  },
  {
    id: "java-interop",
    label: "Interop: wspólna scena (Lab.*)",
    runtime: "java",
    entry: "GameMain.java",
    files: { "GameMain.java": content("java-interop.java") },
  },
  {
    id: "java-console",
    label: "Konsola",
    runtime: "java",
    entry: "Main.java",
    files: { "Main.java": 'public class Main {\n  public static void main(String[] a) {\n    System.out.println("Witaj z Javy!");\n    int suma = 0;\n    for (int i = 1; i <= 10; i++) suma += i;\n    System.out.println("Suma 1..10 = " + suma);\n  }\n}\n' },
  },
  {
    id: "cs-console",
    label: "Konsola",
    runtime: "csharp",
    entry: "Program.cs",
    files: { "Program.cs": content("cs-console.cs") },
  },
];
