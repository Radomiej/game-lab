import type { LabRuntime } from "../core/protocol";
import { javascriptRuntime, typescriptRuntime } from "./javascript";
import { luaRuntime } from "./lua";
import { pythonRuntime } from "./python";
import { cppRuntime } from "./cpp";
import { csharpRuntime } from "./csharp";
import { javaRuntime } from "./java";
import { luauRuntime } from "./stubbed";

export const runtimes: LabRuntime[] = [
  javascriptRuntime,
  typescriptRuntime,
  luaRuntime,
  luauRuntime,
  pythonRuntime,
  cppRuntime,
  csharpRuntime,
  javaRuntime,
];
