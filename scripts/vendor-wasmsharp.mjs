// Vendoruje @wasmsharp/core do public/vendor/wasmsharp jako czysty ESM
// przeglądarkowy (wzorzec: java-lab vendoring teavm). Łatki:
//  - `import X from "./file.dll|wasm|dat"` -> const X = new URL("./file", import.meta.url)
//    (runtime oczekuje string-URLi jako resolvedUrl)
//  - import comlinka z unpkg -> ./comlink.mjs (offline)
//  - importy bez rozszerzenia (.js) -> dopisuje .js
// Uruchom: node scripts/vendor-wasmsharp.mjs
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const src = join(root, "node_modules/@wasmsharp/core");
const dst = join(root, "public/vendor/wasmsharp");

if (!existsSync(src)) {
  console.error("brak node_modules/@wasmsharp/core — npm install najpierw");
  process.exit(1);
}
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, {
  recursive: true,
  filter: (s) => !s.endsWith(".d.ts") && !s.endsWith(".js.map"),
});
copyFileSync(join(root, "node_modules/comlink/dist/esm/comlink.mjs"), join(dst, "comlink.mjs"));

const ASSET = /\.(wasm|dll|dat)$/;
let patched = { assets: 0, comlink: 0, extless: 0 };

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : [],
  );

for (const file of walk(dst)) {
  let code = readFileSync(file, "utf8");
  let orig = code;

  // importy assetów -> URL stringi
  code = code.replace(
    /^import\s+(\w+)\s+from\s+"(\.[^"]+)";/gm,
    (m, name, spec) => (ASSET.test(spec) ? (patched.assets++, `const ${name} = new URL("${spec}", import.meta.url).href;`) : m),
  );
  // comlink z CDN -> lokalny
  code = code.replace(
    /"https:\/\/unpkg\.com\/comlink\/dist\/esm\/comlink\.mjs"/g,
    () => (patched.comlink++, '"./comlink.mjs"'),
  );
  // importy bez rozszerzenia -> .js (jeśli plik istnieje)
  code = code.replace(/from\s+"(\.[^"]+)"/g, (m, spec) => {
    if (ASSET.test(spec) || spec.endsWith(".js") || spec.endsWith(".mjs")) return m;
    const abs = join(dirname(file), spec + ".js");
    if (existsSync(abs)) return (patched.extless++, `from "${spec}.js"`);
    return m;
  });

  if (code !== orig) writeFileSync(file, code);
}

// Keep the browser-side [JSImport] bridge supported after re-vendoring.
const initializer = join(dst, "initializeWasmSharpModule.js");
let initCode = readFileSync(initializer, "utf8");
initCode = initCode.replace(
  "const { getAssemblyExports, getConfig } = await hostBuilder",
  "const runtime = await hostBuilder",
);
initCode = initCode.replace(
  "        .create();\n    const config = getConfig();",
  `        .create();
    const { getAssemblyExports, getConfig } = runtime;
    if (options?.moduleImports) runtime.setModuleImports("LabBridge", options.moduleImports);
    const config = getConfig();`,
);
initCode = initCode.replace(
  "const assembliesAssets = resources.coreAssembly.concat(resources.assembly);",
  `const lazyAssemblies = resources.lazyAssembly ?? [];
    if (lazyAssemblies.some((asset) => asset.virtualPath === "System.Runtime.dll")) {
        await runtime.INTERNAL.loadLazyAssembly("System.Runtime.dll");
    }
    if (lazyAssemblies.some((asset) => asset.virtualPath === "LabBridge.dll")) {
        await runtime.INTERNAL.loadLazyAssembly("LabBridge.dll");
    }
    const assembliesAssets = resources.coreAssembly.concat(resources.assembly, lazyAssemblies);`,
);
if (!initCode.includes('runtime.setModuleImports("LabBridge", options.moduleImports)') || !initCode.includes('runtime.INTERNAL.loadLazyAssembly("LabBridge.dll")')) {
  throw new Error("Could not apply the LabBridge initialization patch to WasmSharp");
}
writeFileSync(initializer, initCode);

const size = (d) => readdirSync(d, { withFileTypes: true })
  .reduce((a, e) => a + (e.isDirectory() ? size(join(d, e.name)) : require("node:fs").statSync(join(d, e.name)).size), 0);
console.log("vendored ->", dst, "| latki:", patched);
