// Rebuilds the precompiled C# facade consumed by WasmSharp and the browser runtime.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = join(root, "src/interop/csharp/LabBridge.csproj");
const output = join(root, "work/lab-bridge-build");
const destination = join(root, "public/vendor/wasmsharp/LabBridge.dll");
const bundledDotnet = join(root, "work/dotnet-preview/dotnet");
const dotnet = process.env.DOTNET ?? (existsSync(bundledDotnet) ? bundledDotnet : "dotnet");
const env = {
  ...process.env,
  DOTNET_CLI_HOME: process.env.DOTNET_CLI_HOME ?? join(root, "work/dotnet-home"),
  DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
  DOTNET_NOLOGO: "1",
};

mkdirSync(output, { recursive: true });
execFileSync(dotnet, ["build", project, "-c", "Release", "-o", output], {
  cwd: root,
  stdio: "inherit",
  env,
});
copyFileSync(join(output, "LabBridge.dll"), destination);
const sdkBasePath = execFileSync(dotnet, ["--info"], { encoding: "utf8", env })
  .match(/^ Base Path:\s+(.+)$/m)?.[1];
if (!sdkBasePath) throw new Error("Could not locate the active .NET SDK");
const dotnetRoot = resolve(sdkBasePath, "../..");
const expectedRuntime = "10.0.0-preview.6.25358.103";
const runtimeDir = join(dotnetRoot, "shared/Microsoft.NETCore.App");
const runtimeVersion = readdirSync(runtimeDir).find((version) => version === expectedRuntime);
if (!runtimeVersion) {
  throw new Error(`WasmSharp ships .NET ${expectedRuntime}; use a matching SDK with DOTNET=/path/to/dotnet`);
}
copyFileSync(
  join(runtimeDir, runtimeVersion, "System.Runtime.dll"),
  join(root, "public/vendor/wasmsharp/System.Runtime.dll"),
);
console.log("generated ->", destination);
