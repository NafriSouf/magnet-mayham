// Komplett synthetisierte Sounds über die Web Audio API – keine Audiodateien nötig.

let ctx = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('mm-muted') === '1'; } catch { /* egal */ }

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function isMuted() { return muted; }
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('mm-muted', v ? '1' : '0'); } catch { /* egal */ }
  if (master) master.gain.value = v ? 0 : 0.5;
}

function tone({ f = 440, f2 = null, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, attack = 0.005 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.4, f = 1000, f2 = null, q = 1, type = 'lowpass', delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

let lastHit = 0;
export const sfx = {
  toggle(pol) { tone({ f: pol > 0 ? 660 : 440, f2: pol > 0 ? 990 : 300, type: 'square', dur: 0.08, vol: 0.08 }); },
  pulse() {
    tone({ f: 120, f2: 520, type: 'sawtooth', dur: 0.22, vol: 0.18 });
    noise({ dur: 0.25, vol: 0.25, f: 400, f2: 3000, type: 'bandpass', q: 2 });
  },
  hit(s) {
    const now = performance.now();
    if (now - lastHit < 40) return;
    lastHit = now;
    tone({ f: 180 + s * 120, f2: 60, type: 'triangle', dur: 0.12, vol: 0.12 + s * 0.25 });
  },
  explode() {
    noise({ dur: 0.7, vol: 0.9, f: 2000, f2: 60 });
    tone({ f: 90, f2: 30, type: 'sine', dur: 0.5, vol: 0.6 });
  },
  fuse() { noise({ dur: 0.3, vol: 0.15, f: 5000, type: 'highpass' }); },
  fall() { tone({ f: 700, f2: 80, type: 'sawtooth', dur: 0.8, vol: 0.15 }); },
  ko() { [523, 659, 784].forEach((f, i) => tone({ f, type: 'square', dur: 0.1, vol: 0.08, delay: i * 0.06 })); },
  pickup() { [660, 880, 1320].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.12, vol: 0.15, delay: i * 0.05 })); },
  count() { tone({ f: 440, type: 'square', dur: 0.12, vol: 0.12 }); },
  go() { tone({ f: 880, type: 'square', dur: 0.3, vol: 0.15 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'square', dur: 0.25, vol: 0.12, delay: i * 0.12 })); },
  click() { tone({ f: 900, type: 'sine', dur: 0.05, vol: 0.08 }); },
};
