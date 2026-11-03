import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const chromiumPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const profile = await mkdtemp(join(tmpdir(), 'gamelab-interop-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5193', '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const browser = spawn(chromiumPath, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=127.0.0.1;localhost', '--ignore-certificate-errors'] : []),
  '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

let viteLogs = '';
vite.stdout.on('data', (chunk) => { viteLogs += chunk.toString(); });
vite.stderr.on('data', (chunk) => { viteLogs += chunk.toString(); });

async function waitFor(check, message, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`${message}${lastError ? `: ${lastError}` : ''}`);
}

class DevTools {
  constructor(socketUrl) {
    this.socket = new WebSocket(socketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', ({ data }) => {
      const packet = JSON.parse(data);
      const pending = this.pending.get(packet.id);
      if (!pending) return;
      this.pending.delete(packet.id);
      if (packet.error) pending.reject(new Error(packet.error.message));
      else pending.resolve(packet.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  close() { this.socket.close(); }
}

try {
  const query = new URLSearchParams({ calls: process.env.INTEROP_CALLS || '500', samples: process.env.INTEROP_SAMPLES || '5' });
  if (process.env.INTEROP_ONLY) query.set('only', process.env.INTEROP_ONLY);
  const appUrl = `http://127.0.0.1:5193/scripts/interop-harness.html?${query}`;
  await waitFor(async () => (await fetch('http://127.0.0.1:5193/')).ok, 'Vite did not start');
  const activePortPath = join(profile, 'DevToolsActivePort');
  const activePort = await waitFor(async () => {
    try { return await readFile(activePortPath, 'utf8'); } catch { return null; }
  }, 'Chromium did not start');
  const browserPort = Number(activePort.split('\n')[0]);
  const targetResponse = await fetch(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' });
  assert.equal(targetResponse.status, 200, 'Chromium must create the interop test page');
  const target = await targetResponse.json();
  const devtools = new DevTools(target.webSocketDebuggerUrl);
  await devtools.send('Runtime.enable');

  const report = await waitFor(async () => {
    const { result } = await devtools.send('Runtime.evaluate', {
      expression: 'window.__INTEROP_REPORT__ ? JSON.stringify(window.__INTEROP_REPORT__) : ""',
      returnByValue: true,
    });
    return result.value ? JSON.parse(result.value) : null;
  }, `Interop browser harness did not finish. Vite output: ${viteLogs}`, 600_000);
  devtools.close();
  if (process.env.INTEROP_REPORT_PATH) {
    await writeFile(process.env.INTEROP_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    createdAt: report.createdAt,
    crossOriginIsolated: report.crossOriginIsolated,
    testCount: report.testCount,
    passCount: report.passCount,
    failures: report.failures,
    benchmarks: report.benchmarks,
    frameBenchmarks: report.frameBenchmarks,
    scaleBenchmarks: report.scaleBenchmarks,
    skippedTargets: report.skippedTargets,
    skippedBehaviors: report.skippedBehaviors,
  }, null, 2));
  assert.equal(report.failures.length, 0, JSON.stringify(report.failures, null, 2));
  if (!process.env.INTEROP_ONLY) assert.ok(report.benchmarks.length > 0, 'Harness must report interop timings');
} finally {
  vite.kill('SIGTERM');
  browser.kill('SIGTERM');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
