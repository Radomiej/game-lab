# C# JavaScript bridge

`LabBridge.dll` is compiled offline so the Roslyn code students compile in the
browser can reference generated `[JSImport]` stubs. At runtime, WasmSharp
registers the `LabBridge` module import and lazily loads the bridge assembly.
Calls into `Lab.*` then synchronously dispatch to the active JavaScript host.

WasmSharp currently bundles .NET `10.0.0-preview.6.25358.103`. Build the bridge
with the matching SDK/runtime so its metadata stays compatible:

```sh
DOTNET=/path/to/dotnet-10.0.100-preview.6.25358.103 npm run build:csharp-bridge
```

The build copies `LabBridge.dll` and the matching `System.Runtime.dll` into
`public/vendor/wasmsharp/`. The repository's `work/dotnet-preview/dotnet` is
used automatically when present. Do not build this bridge with a later .NET
SDK while WasmSharp still ships the Preview 6 runtime.

`Lab` exposes synchronous object, transform, renderer, component, property,
method-call, input, viewport, and console operations. JSON is encoded by the
bridge itself to avoid relying on libraries trimmed from WasmSharp's runtime.
