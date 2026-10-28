import type { LabRuntime } from "../core/protocol";
import { javascriptRuntime, typescriptRuntime } from "./javascript";
import { luaRuntime } from "./lua";
import { pythonRuntime } from "./python";
import { cppRuntime } from "./cpp";
import { javaRuntime, luauRuntime, kotlinRuntime } from "./stubbed";

export const runtimes: LabRuntime[] = [
  javascriptRuntime,
  typescriptRuntime,
  luaRuntime,
  luauRuntime,
  pythonRuntime,
  cppRuntime,
  javaRuntime,
  kotlinRuntime,
];
