import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    // JSCPP jest CJS i ładowane dynamicznie — musi być prebundlowane
    include: ["JSCPP"],
  },
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: true,
    // Odkomentuj, gdy runtime potrzebuje blokującego stdin
    // (SharedArrayBuffer/Atomics -> cross-origin isolation):
    // headers: {
    //   "Cross-Origin-Opener-Policy": "same-origin",
    //   "Cross-Origin-Embedder-Policy": "require-corp",
    // },
  },
});
