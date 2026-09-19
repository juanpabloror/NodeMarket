export const TIERS = {
  high: { count: 180, dpr: 2, bloom: true },
  medium: { count: 110, dpr: 1.5, bloom: false },
  low: { count: 60, dpr: 1, bloom: false },
};

const ORDER = ['high', 'medium', 'low'];

// ?quality=high|medium|low fija el nivel y desactiva el ajuste automático (útil para depurar).
export function forcedTier() {
  const value = new URLSearchParams(window.location.search).get('quality');
  return value in TIERS ? value : null;
}

export function initialTier() {
  const forced = forcedTier();
  if (forced) return forced;
  const small = window.innerWidth < 768;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  return small || weak ? 'medium' : 'high';
}

export function nextLowerTier(name) {
  return ORDER[ORDER.indexOf(name) + 1] ?? null;
}

// Baja de nivel cuando el promedio de FPS se mantiene bajo `minFps` durante varias revisiones seguidas.
export function createFpsMonitor(onDrop, { minFps = 42, warmup = 3000, strikes = 3 } = {}) {
  let last = 0;
  let avg = 1000 / 60;
  let mute = performance.now() + warmup;
  let nextCheck = mute + 1000;
  let bad = 0;

  return {
    sample() {
      const now = performance.now();
      const frame = now - last;
      last = now;
      if (now < mute || frame > 250) return;
      avg += (frame - avg) * 0.05;
      if (now < nextCheck) return;
      nextCheck = now + 1000;
      bad = 1000 / avg < minFps ? bad + 1 : Math.max(0, bad - 1);
      if (bad >= strikes) {
        bad = 0;
        avg = 1000 / 60;
        mute = now + warmup;
        nextCheck = mute + 1000;
        onDrop();
      }
    },
    reset() {
      last = 0;
      mute = performance.now() + 1000;
      nextCheck = mute + 1000;
    },
  };
}
