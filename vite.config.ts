import { defineConfig } from "vite";

export default defineConfig({
  // php-wasm: .wasm/.dat jako assety URL (wzór z web-learning-lab)
  assetsInclude: ["**/*.wasm", "**/*.dat", "**/*.so"],
  build: {
    // @luau-rs/luau: glue WASM używa top-level await (wymaga es2022+)
    target: "es2022",
  },
  esbuild: { target: "es2022" },
  optimizeDeps: {
    // JSCPP jest CJS i ładowane dynamicznie — musi być prebundlowane
    // @php-wasm/universal: CJS -> prebundle; web-8-4 wyłączone, żeby
    // import .wasm trafił w assetsInclude zamiast w dep-optimizer
    include: ["JSCPP", "@php-wasm/universal"],
    // @wasmsharp/core: vendored w public/vendor/wasmsharp (raw ESM)
    // — omija bundler całkowicie (import.meta.url -> assety .dll/.wasm)
    exclude: ["@wasmsharp/core", "@php-wasm/web-8-4", "@luau-rs/luau"],
    esbuildOptions: { target: "es2022" },
  },
  server: {
    host: "127.0.0.1",
    port: 5191,
    strictPort: true,
    // SharedArrayBuffer dla synchronicznego interopu Java (TeaVM worker):
    // Atomics.wait w workerze + natychmiastowa obsługa na main thread.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
