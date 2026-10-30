export const OUTPUT_LIMIT = 20_000;
export const FRAME_OUTPUT_LIMIT = 4_000;
export const TRUNCATION_MESSAGE = '[Dalszy tekst pominięty: limit wyjścia programu.]';

export function createOutputCapture(limit = OUTPUT_LIMIT) {
  let text = '';
  let truncated = false;
  return {
    push(value) {
      if (truncated) return;
      const line = String(value);
      const available = limit - text.length;
      const prefix = text ? '\n' : '';
      if (prefix.length + line.length <= available) text += prefix + line;
      else {
        const suffix = '\n' + TRUNCATION_MESSAGE;
        text = (text + prefix + line.slice(0, Math.max(0, available))).slice(0, Math.max(0, limit - suffix.length)) + suffix;
        truncated = true;
      }
    },
    get text() { return text; },
  };
}

export function createFrameGate() {
  let nextId = 0;
  let pending;
  return {
    begin() { if (pending !== undefined) return; pending = ++nextId; return pending; },
    acknowledge(id) { if (id === pending) pending = undefined; },
  };
}
