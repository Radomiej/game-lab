# Interop conformance and benchmark

Run the complete local checks with `npm test`. The browser suite needs Chromium and network access for the existing Pyodide CDN dependency. Set `CHROMIUM_PATH` when Chromium is installed outside `/usr/bin/chromium`.

```sh
npm run test:teavm-sync
npm run test:interop
```

`test:interop` starts a local Vite server and isolated headless Chromium page with the same COOP/COEP headers used by the app. It runs the real runtime adapters and checks:

- Same-call property write/read and method return values from JS, TS, Lua, Luau, Python, PHP, C++, C#, and Java.
- Pipe and Unicode string round-trips where supported. JSCPP's parser cannot compile non-ASCII characters inside a C++ string literal, so its shared contract case checks the pipe character with ASCII text.
- Every caller runtime invoking live components supplied by JS, Lua, Luau, Python, and C++ (45 caller/target combinations, including same-runtime control cases).
- C++ components keep the JSCPP runtime context after `main()` and expose numeric get/set plus one-number method dispatch through `lab_attachComponent`.
- Scale tests register 1000 separate JavaScript, TypeScript, Lua, Luau, Python, Java, C++, and PHP snapshot components, invoke each component once, then read all states back to detect cross-component state leaks. `scaleBenchmarks` reports registration, 1000 calls/resumes, and 1000 reads separately.
- PHP exposes an explicit-state component path: `Lab::attachStateComponent` stores JSON state and a PHP handler file; JavaScript calls it with `await lab.callAsync(id, method, ...args)`. Each call runs a fresh PHP request and returns `{state, result}`. Sequential and queued calls, Unicode/backslash state, and rollback after a failed step are covered.
- Java uses the synchronous TeaVM bridge from its retained game runtime to call components in the shared world. Java can call the JS, Lua, Luau, Python, and C++ providers; user-defined Java component methods are not yet exposed as providers to other runtimes.
- Nested calls through a JS component into Lua, Luau, Python, or C++.
- Sixty `update(dt)` callbacks with a synchronous foreign component call for JS, TS, Lua, Luau, and Python. Java gets a real 120-frame `GameMain.onUpdate` run plus a no-interop baseline so the runtime's one-second FPS sampler has enough time to report.
- Resource disposal when a component bridge is removed.

The 45-route synchronous matrix uses JS, Lua, Luau, Python, and C++ as component providers. The C++ provider ABI currently supports numeric properties and methods with at most one numeric argument. PHP exposes snapshot-based components through asynchronous `callAsync`; Java can call into the shared world synchronously but does not yet expose its own callable component methods. PHP has no automatic per-frame update hook. C# still does not expose callable user-defined components. PHP and C# are one-shot runners without persistent update hooks. The report lists these gaps rather than counting them as passing paths.

### PHP snapshot component contract

The PHP WASM module keeps its MEMFS, but each `PHP.run()` starts with reset PHP globals. A PHP handler therefore receives the current state on every invocation and must return the next state explicitly:

```php
function lab_component_dispatch($state, $method, $args) {
    if ($method === "add") $state["count"] += (int)$args[0];
    return ["state" => $state, "result" => $state["count"]];
}
```

Register it from a PHP entry script with `Lab::attachStateComponent($objectId, "Counter", "counter-step.php", ["count" => 0])`. A JS/TS caller can then do `const value = await lab.callAsync(id, "add", 1)`. Calls are serialized through one PHP request queue; if a request fails, the last accepted state remains intact. This is resumable state, not a live PHP object or preserved globals.

The benchmark makes 500 calls per route over five samples by default. For each caller it subtracts the median time of a same-sized empty loop from the median call-loop time, then reports approximate per-call cost and the estimated cost of 60 such calls in one frame. Runtime startup and compilation are warmed and largely cancel between the two runs. This is a local browser measurement, not a guarantee for every device. The separate `frameBenchmarks` section measures 60 actual animation-frame updates for persistent runtimes.

Override the benchmark size when debugging:

```sh
INTEROP_CALLS=20 INTEROP_SAMPLES=1 npm run test:interop
```

Run only one named test while debugging:

```sh
INTEROP_ONLY='Java worker keeps live component handlers' npm run test:interop
```

Set `INTEROP_REPORT_PATH=/tmp/interop-report.json` to save the full machine-readable run report.

### Sample 1000-component run

Measured in headless Chromium on 2026-11-03. These are timings for registering 1000 components, invoking all 1000 once, and reading all 1000 states; they are not per-frame updates. JavaScript and TypeScript run on the same native JS engine, with TypeScript transpiled before execution.

| Runtime | Register 1000 | Invoke 1000 | Read 1000 | State isolation |
| --- | ---: | ---: | ---: | --- |
| JavaScript | 1.8 ms | 0.76 ms | 0.16 ms | passed |
| TypeScript | 3.0 ms | 0.11 ms | 0.07 ms | passed |
| Lua / wasmoon | 51.7 ms | 122.2 ms | 0.20 ms | passed |
| Luau / WASM | 40.7 ms | 9.50 ms | 1.17 ms | passed |
| Python / Pyodide | 34.3 ms | 6.99 ms | 1.05 ms | passed |
| C++ / JSCPP | 86.3 ms | 15.0 ms | 7.63 ms | passed |
| PHP 8.4 snapshot/resume | 76.4 ms | 610.2 ms | 0.33 ms | passed |

These timings vary by machine and include the runtime's bridge and JSON conversion costs. The Lua batch averaged 122 μs per component; calling all 1000 each frame exceeds the 16.7 ms budget. C++ took 15.0 ms for 1000 calls, leaving little frame budget. PHP's sequential resumptions are unsuitable for calling all 1000 each frame. JavaScript, TypeScript, Luau, and Python fit the 1000-call batch in this run. Java is omitted as a provider because it does not yet expose its own callable component methods. C# is omitted because it does not expose callable user-defined components either. The separate interop route and frame benchmarks report costs for smaller per-frame workloads.
