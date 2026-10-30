export function disposeGameRuntime(runtime) {
  if (!runtime || runtime.disposed) return;
  runtime.disposed = true;
  clearInterval(runtime.interval);
  runtime.app.exports.dispose?.();
}

export function invokeGameExport(runtime, name, args, stop, postMessage) {
  if (!runtime || runtime.disposed) return;
  try { runtime.app.exports[name]?.(...args); }
  catch (error) {
    stop();
    postMessage({ command: "game-error", gameId: runtime.gameId,
      error: error instanceof Error ? error.message : String(error) });
  }
}
