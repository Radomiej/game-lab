import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    // JSCPP jest CJS i ładowane dynamicznie — musi być prebundlowane
    include: ["JSCPP"],
    // @wasmsharp/core: vendored w public/vendor/wasmsharp (raw ESM)
    // — omija bundler całkowicie (import.meta.url -> assety .dll/.wasm)
    exclude: ["@wasmsharp/core"],
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
