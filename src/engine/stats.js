/** Bufor kołowy czasów klatek dla paska konsoli — okno czasowe, nie licznik klatek. */
export function createFrameStats(windowMs = 3000) {
  let samples = [];
  let sum = 0;
  function prune(now) {
    while (samples.length && now - samples[0].t > windowMs) {
      sum -= samples[0].ms;
      samples.shift();
    }
  }
  return {
    push(ms, now) {
      if (!Number.isFinite(ms) || ms < 0 || !Number.isFinite(now)) return;
      samples.push({ t: now, ms });
      sum += ms;
      prune(now);
    },
    snapshot(now) {
      const t = now ?? (samples.length ? samples[samples.length - 1].t : 0);
      prune(t);
      const n = samples.length;
      if (!n) return { frames: 0, fps: 0, avgMs: 0, maxMs: 0 };
      const avgMs = sum / n;
      let maxMs = 0;
      for (const sample of samples) if (sample.ms > maxMs) maxMs = sample.ms;
      return { frames: n, fps: avgMs > 0 ? 1000 / avgMs : 0, avgMs, maxMs };
    },
    reset() { samples = []; sum = 0; },
  };
}
