import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const vendor = join(root, 'public/vendor/teavm');
const runtimePath = join(vendor, 'cdn/compiler.wasm-runtime.js');
const { load } = await import(pathToFileURL(runtimePath));
const [compilerBytes, sdk, classlib, bridge] = await Promise.all([
  readFile(join(vendor, 'cdn/compiler.wasm')),
  readFile(join(vendor, 'cdn/compile-classlib-teavm.bin')),
  readFile(join(vendor, 'cdn/runtime-classlib-teavm.bin')),
  readFile(join(vendor, 'bridge/Lab.class')),
]);

const calls = [];
globalThis.self = globalThis;
globalThis.self.__lab = {
  spawn(name) { calls.push(['spawn', name]); return 101; },
  destroy(id) { calls.push(['destroy', id]); },
  attachComponent(id, kind) { calls.push(['attachComponent', id, kind]); return 202; },
  attachRenderer(id, spec) { calls.push(['attachRenderer', id, spec]); },
  setPosition(id, x, y) { calls.push(['setPosition', id, x, y]); },
  set(id, prop, value) { calls.push(['set', id, prop, value]); },
  get(id, prop) {
    calls.push(['get', id, prop]);
    return prop === 'x' ? '60.2' : prop === 'name' ? 'Chaser' : '';
  },
  call(id, method, argsJson) { calls.push(['call', id, method, argsJson]); return JSON.stringify('ok'); },
  findComponent(kind) { calls.push(['findComponent', kind]); return 303; },
  posX(id) { calls.push(['posX', id]); return 11.5; },
  posY(id) { calls.push(['posY', id]); return 12.5; },
};

const { exports } = await load(new Int8Array(compilerBytes));
const compiler = exports.createCompiler();
compiler.setSdk(new Int8Array(sdk));
compiler.setTeaVMClasslib(new Int8Array(classlib));
compiler.addClassFile('engine/Lab.class', new Int8Array(bridge));
const diagnostics = [];
compiler.onDiagnostic(diagnostic => diagnostics.push(diagnostic));
compiler.addSourceFile('Main.java', `
package lab;
import engine.*;
public class Main {
  public static void main(String[] args) {
    int object = Lab.spawn("EnemyJava");
    Lab.attachRenderer(object, "{\\"type\\":\\"sprite\\"}");
    Lab.setPosition(object, 1, 2);
    int marker = Lab.attachComponent(object, "JavaMarker");
    Lab.pushProp(marker, "hp", "100");
    int chaser = Lab.findComponent("Chaser");
    String name = Lab.getProp(chaser, "name");
    double x = Lab.getNum(chaser, "x");
    Lab.setNum(chaser, "speed", 260);
    int callId = Lab.call(chaser, "setTarget", "[200,400]");
    String result = Lab.pollResult(callId);
    Lab.destroyObject(object);
    System.out.println(object + "|" + marker + "|" + chaser + "|" + name + "|" + x + "|"
        + result + "|" + Lab.getX(object) + "|" + Lab.getY(object) + "|" + Lab.resolveId(object));
  }
}`);

console.log('[phase] compile start');
if (!compiler.compile()) {
  throw new Error(`Java compile failed: ${JSON.stringify(diagnostics)}`);
}
console.log('[phase] compile ok, generating wasm');
if (!compiler.generateWebAssembly({ outputName: 'sync-smoke', mainClass: 'lab.Main' })) {
  throw new Error(`TeaVM generation failed: ${JSON.stringify(diagnostics)}`);
}
const wasm = compiler.getWebAssemblyOutputFile('sync-smoke.wasm');
assert.ok(wasm?.length, 'TeaVM generated a WebAssembly module');

const output = [];
const oldLog = console.log;
console.log = (...parts) => output.push(parts.join(' '));
try {
  const app = await load(wasm);
  try {
    app.exports.main([]);
  } catch (error) {
    console.error('TeaVM call trace before failure:', JSON.stringify(calls));
    throw error;
  }
} finally {
  console.log = oldLog;
}

assert.deepEqual(output, ['101|202|303|Chaser|60.2|"ok"|11.5|12.5|101']);
assert.deepEqual(calls, [
  ['spawn', 'EnemyJava'],
  ['attachRenderer', 101, '{"type":"sprite"}'],
  ['setPosition', 101, 1, 2],
  ['attachComponent', 101, 'JavaMarker'],
  ['set', 202, 'hp', '100'],
  ['findComponent', 'Chaser'],
  ['get', 303, 'name'],
  ['get', 303, 'x'],
  ['set', 303, 'speed', '260.0'],
  ['call', 303, 'setTarget', '[200,400]'],
  ['destroy', 101],
  ['posX', 101],
  ['posY', 101],
]);
console.log('PASS: TeaVM 0.16.0 Java Lab calls return synchronously through the JS bridge');
