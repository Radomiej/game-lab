# TeaVM Java compiler browser assets

The TeaVM compiler assets are generated from `konsoletyper/teavm-javac` at commit
[`208d4c97`](https://github.com/konsoletyper/teavm-javac/commit/208d4c97a602ba0df055f16e6882059fb69d0122),
which pins TeaVM **0.16.0**:

- `compiler.wasm-runtime.js`
- `compiler.wasm`
- `compile-classlib-teavm.bin`
- `runtime-classlib-teavm.bin`
- `bridge/Lab.class` (generated from this repository's `src/engine/java/Lab.java`)

The upstream project is licensed under Apache License 2.0 and uses OpenJDK components
under GPLv2 with the Classpath Exception. The Apache license text is in
`LICENSE-2.0.txt`; see the upstream README and
[OpenJDK legal notices](https://openjdk.org/legal/gplv2+ce.html) for the corresponding
terms. Regenerate the bridge with `npm run build:teavm-bridge` and JDK 25.

These files are served from this site's own origin because the upstream host does not
provide the CORS header required for browser module imports from a different origin.
