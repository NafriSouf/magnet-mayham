// Magnet Mayhem – reine Spielsimulation (kein DOM, läuft auch in Node für Tests).
// Der Host (bzw. das lokale Spiel) ist die einzige Instanz, die simuliert.

export const CFG = {
  ARENA_R: 440,        // Startradius des Rings
  RING_MIN: 90,        // kleinster Ringradius
  SHRINK_START: 18,    // Sekunden bis der Ring schrumpft
  SHRINK_SPEED: 13,    // px/s

  PLAYER_R: 22,
  ACCEL: 1250,
  DAMP: 2.4,
  OBJ_DAMP: 1.5,
  MAX_SPEED: 950,
  OBJ_MAX_SPEED: 1300,

  FIELD_RANGE: 250,
  FIELD_PP: 650,       // Feldstärke Spieler -> Spieler
  FIELD_PO: 900,       // Feldstärke Spieler -> Objekt
  REACTION: 0.4,       // Rückstoß, den Objekte auf den Spieler ausüben
  PULSE_TIME: 0.28,
  PULSE_CD: 2.2,
  PULSE_MULT: 5,
  PULSE_RANGE: 1.35,
  PULSE_ANCHOR: 0.2,   // beim Puls ist man "verankert"
  TOGGLE_CD: 0.12,

  BOMB_FUSE: 2.0,
  EXPLOSION_R: 175,
  EXPLOSION_IMPULSE: 1150,

  EFFECT_TIME: 8,
  MAX_CRATES: 7,
  MAX_BOMBS: 3,
  MAX_POWERUPS: 2,
  KO_CREDIT_TIME: 4,
};

export const POLE_PLUS = 1;
export const POLE_MINUS = -1;

export const PLAYER_COLORS = [
  '#ffd23f', '#3bceac', '#c77dff', '#ff9f1c',
  '#9ef01a', '#f15bb5', '#f8f9fa', '#00bbf9',
];

export const POWERUPS = ['super', 'heavy', 'speed', 'flip'];
const OBJ_TYPES = ['crate', 'bomb', 'power'];

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame({ winsNeeded = 3, seed = Date.now() } = {}) {
  return {
    phase: 'lobby',     // lobby | countdown | play | roundEnd | matchEnd
    phaseT: 0,
    t: 0,
    roundTime: 0,
    round: 0,
    winsNeeded,
    ringR: CFG.ARENA_R,
    players: [],
    objects: [],
    nextObjId: 1,
    spawnT: 0,
    powerT: 0,
    roundWinner: null,  // id, -1 = Unentschieden
    matchWinner: null,
    rand: makeRng(seed),
    metaVer: 1,
  };
}

// ---------------------------------------------------------------- Spieler

export function addPlayer(s, { id, name, color, bot = false, difficulty = 'normal' }) {
  const p = {
    id, name: String(name || 'Spieler').slice(0, 16), color: color || freeColor(s),
    bot, difficulty,
    x: 0, y: 0, vx: 0, vy: 0, r: CFG.PLAYER_R,
    pol: POLE_PLUS, alive: false, fallT: 99,
    pulseT: 0, pulseCd: 0, togCd: 0,
    eff: { super: 0, heavy: 0, speed: 0 },
    wins: 0, kos: 0,
    lastHit: null, lastHitT: -99,
    input: { mx: 0, my: 0, tg: 0, pu: 0 },
    seenTg: 0, seenPu: 0,
    ai: null,
  };
  s.players.push(p);
  s.metaVer++;
  return p;
}

export function removePlayer(s, id) {
  const i = s.players.findIndex(p => p.id === id);
  if (i >= 0) { s.players.splice(i, 1); s.metaVer++; }
}

export function freeColor(s) {
  const used = new Set(s.players.map(p => p.color));
  return PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[s.players.length % PLAYER_COLORS.length];
}

export function setInput(s, id, inp) {
  const p = s.players.find(q => q.id === id);
  if (!p || !inp) return;
  const mx = clampNum(inp.mx, -1, 1), my = clampNum(inp.my, -1, 1);
  p.input.mx = mx; p.input.my = my;
  if (Number.isFinite(inp.tg)) p.input.tg = inp.tg | 0;
  if (Number.isFinite(inp.pu)) p.input.pu = inp.pu | 0;
}

function clampNum(v, a, b) {
  v = Number(v);
  if (!Number.isFinite(v)) return 0;
  return v < a ? a : v > b ? b : v;
}

// ---------------------------------------------------------------- Ablauf

export function startMatch(s) {
  for (const p of s.players) { p.wins = 0; p.kos = 0; }
  s.round = 0;
  s.matchWinner = null;
  s.metaVer++;
  startRound(s);
}

export function startRound(s) {
  s.round++;
  s.phase = 'countdown';
  s.phaseT = 3;
  s.roundTime = 0;
  s.ringR = CFG.ARENA_R;
  s.objects = [];
  s.roundWinner = null;
  const n = s.players.length;
  const off = s.rand() * Math.PI * 2;
  s.players.forEach((p, i) => {
    const a = off + (i / Math.max(1, n)) * Math.PI * 2;
    const rr = CFG.ARENA_R * (n <= 2 ? 0.42 : 0.5);
    p.x = Math.cos(a) * rr; p.y = Math.sin(a) * rr;
    p.vx = p.vy = 0;
    p.pol = i % 2 === 0 ? POLE_PLUS : POLE_MINUS;
    p.alive = true; p.fallT = 0;
    p.pulseT = 0; p.pulseCd = 0; p.togCd = 0;
    p.eff = { super: 0, heavy: 0, speed: 0 };
    p.lastHit = null; p.lastHitT = -99;
    p.seenTg = p.input.tg; p.seenPu = p.input.pu;
    p.ai = null;
  });
  // Startobjekte
  for (let i = 0; i < 5; i++) spawnObject(s, 'crate', true);
  for (let i = 0; i < 2; i++) spawnObject(s, 'bomb', true);
  s.spawnT = 5;
  s.powerT = 6;
}

function spawnObject(s, type, instant = false) {
  let x = 0, y = 0;
  for (let tries = 0; tries < 30; tries++) {
    const a = s.rand() * Math.PI * 2;
    const d = Math.sqrt(s.rand()) * s.ringR * 0.72;
    x = Math.cos(a) * d; y = Math.sin(a) * d;
    const free = s.players.every(p => !p.alive || Math.hypot(p.x - x, p.y - y) > 90) &&
      s.objects.every(o => Math.hypot(o.x - x, o.y - y) > 50);
    if (free) break;
  }
  const o = {
    id: s.nextObjId++, type, x, y, vx: 0, vy: 0,
    r: type === 'crate' ? 17 : 15,
    mass: type === 'crate' ? 0.9 : 0.7,
    charge: s.rand() < 0.5 ? POLE_PLUS : POLE_MINUS,
    fuse: -1, spawnT: instant ? 0 : 0.7, fallT: -1, lastTouch: null,
    kind: type === 'power' ? POWERUPS[Math.floor(s.rand() * POWERUPS.length)] : null,
    life: type === 'power' ? 14 : 0,
  };
  s.objects.push(o);
  return o;
}

export function step(s, dt) {
  const ev = [];
  s.t += dt;
  switch (s.phase) {
    case 'lobby':
    case 'matchEnd':
      if (s.phase === 'matchEnd') physics(s, dt, ev, true);
      break;
    case 'countdown': {
      const before = Math.ceil(s.phaseT);
      s.phaseT -= dt;
      handleButtons(s, ev, false);
      tickTimers(s, dt);
      const after = Math.ceil(s.phaseT);
      if (after !== before && after > 0) ev.push({ t: 'count', n: after });
      if (s.phaseT <= 0) { s.phase = 'play'; s.phaseT = 0; ev.push({ t: 'go' }); }
      break;
    }
    case 'play':
      s.roundTime += dt;
      if (s.roundTime > CFG.SHRINK_START) {
        s.ringR = Math.max(CFG.RING_MIN, s.ringR - CFG.SHRINK_SPEED * dt);
      }
      physics(s, dt, ev, false);
      spawning(s, dt, ev);
      checkRoundEnd(s, ev);
      break;
    case 'roundEnd':
      physics(s, dt, ev, true);
      s.phaseT -= dt;
      if (s.phaseT <= 0) {
        const w = s.players.find(p => p.wins >= s.winsNeeded);
        if (w) {
          s.phase = 'matchEnd';
          s.matchWinner = w.id;
          ev.push({ t: 'match', id: w.id });
        } else {
          startRound(s);
          ev.push({ t: 'round', n: s.round });
        }
      }
      break;
  }
  return ev;
}

function checkRoundEnd(s, ev) {
  const total = s.players.length;
  const alive = s.players.filter(p => p.alive);
  if (total === 0) return;
  if ((total >= 2 && alive.length <= 1) || alive.length === 0) {
    s.phase = 'roundEnd';
    s.phaseT = 3.2;
    if (alive.length === 1) {
      alive[0].wins++;
      s.roundWinner = alive[0].id;
    } else {
      s.roundWinner = -1;
    }
    s.metaVer++;
    ev.push({ t: 'roundEnd', id: s.roundWinner });
  }
}

function spawning(s, dt, ev) {
  s.spawnT -= dt;
  if (s.spawnT <= 0) {
    s.spawnT = 4 + s.rand() * 3;
    const crates = s.objects.filter(o => o.type === 'crate' && o.fallT < 0).length;
    const bombs = s.objects.filter(o => o.type === 'bomb' && o.fallT < 0).length;
    const wantBomb = s.rand() < 0.45;
    if (wantBomb && bombs < CFG.MAX_BOMBS) spawnObject(s, 'bomb');
    else if (crates < CFG.MAX_CRATES) spawnObject(s, 'crate');
    else if (bombs < CFG.MAX_BOMBS) spawnObject(s, 'bomb');
  }
  s.powerT -= dt;
  if (s.powerT <= 0) {
    s.powerT = 7 + s.rand() * 5;
    const pw = s.objects.filter(o => o.type === 'power').length;
    if (pw < CFG.MAX_POWERUPS) {
      const o = spawnObject(s, 'power');
      ev.push({ t: 'spawnPower', x: o.x, y: o.y });
    }
  }
}

// ---------------------------------------------------------------- Physik

export function playerMass(p) { return p.eff.heavy > 0 ? 2.6 : 1; }
export function fieldRange(p) {
  return CFG.FIELD_RANGE * (p.pulseT > 0 ? CFG.PULSE_RANGE : 1) * (p.eff.super > 0 ? 1.3 : 1);
}
function fieldStrength(p) {
  return (p.pulseT > 0 ? CFG.PULSE_MULT : 1) * (p.eff.super > 0 ? 1.6 : 1);
}

function handleButtons(s, ev, allowPulse) {
  for (const p of s.players) {
    if (!p.alive) { p.seenTg = p.input.tg; p.seenPu = p.input.pu; continue; }
    if (p.input.tg !== p.seenTg) {
      p.seenTg = p.input.tg;
      if (p.togCd <= 0) {
        p.pol = -p.pol;
        p.togCd = CFG.TOGGLE_CD;
        ev.push({ t: 'toggle', id: p.id, pol: p.pol });
      }
    }
    if (p.input.pu !== p.seenPu) {
      p.seenPu = p.input.pu;
      if (allowPulse && p.pulseCd <= 0) {
        p.pulseT = CFG.PULSE_TIME;
        p.pulseCd = CFG.PULSE_CD;
        ev.push({ t: 'pulse', id: p.id, x: p.x, y: p.y, pol: p.pol });
        // Puls zündet nahe Bomben
        for (const o of s.objects) {
          if (o.type === 'bomb' && o.fallT < 0 && o.spawnT <= 0 &&
            Math.hypot(o.x - p.x, o.y - p.y) < fieldRange(p) * 0.6) {
            lightBomb(o, p.id, ev);
          }
        }
      }
    }
  }
}

function lightBomb(o, by, ev) {
  if (o.fuse < 0) {
    o.fuse = CFG.BOMB_FUSE;
    ev.push({ t: 'fuse', x: o.x, y: o.y });
  }
  if (by != null) o.lastTouch = by;
}

function tickTimers(s, dt) {
  for (const p of s.players) {
    p.pulseT = Math.max(0, p.pulseT - dt);
    p.pulseCd = Math.max(0, p.pulseCd - dt);
    p.togCd = Math.max(0, p.togCd - dt);
    for (const k in p.eff) p.eff[k] = Math.max(0, p.eff[k] - dt);
    if (!p.alive) p.fallT += dt;
  }
}

function physics(s, dt, ev, frozenRules) {
  handleButtons(s, ev, true);

  const alive = s.players.filter(p => p.alive);
  const solids = s.objects.filter(o => o.type !== 'power' && o.fallT < 0 && o.spawnT <= 0);

  // 1) Steuerung
  for (const p of alive) {
    let mx = p.input.mx, my = p.input.my;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const acc = CFG.ACCEL * (p.eff.speed > 0 ? 1.55 : 1);
    p.vx += mx * acc * dt;
    p.vy += my * acc * dt;
  }

  // 2) Magnetfelder
  for (const a of alive) {
    const R = fieldRange(a);
    const S = fieldStrength(a);
    const anchor = a.pulseT > 0 ? CFG.PULSE_ANCHOR : 1;
    const ma = playerMass(a);
    for (const b of alive) {
      if (b === a) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= R || d < 1e-3) continue;
      const k = 1 - d / R;
      const f = CFG.FIELD_PP * S * k * Math.sqrt(k);
      const sign = a.pol * b.pol; // +1 abstoßen, -1 anziehen
      const mb = playerMass(b);
      b.vx += (dx / d) * sign * f / mb * dt;
      b.vy += (dy / d) * sign * f / mb * dt;
      if (f / mb > 300) { b.lastHit = a.id; b.lastHitT = s.t; }
    }
    for (const o of solids) {
      const dx = o.x - a.x, dy = o.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= R || d < 1e-3) continue;
      const k = 1 - d / R;
      const f = CFG.FIELD_PO * S * k * Math.sqrt(k);
      const sign = a.pol * o.charge;
      const nx = dx / d, ny = dy / d;
      o.vx += nx * sign * f / o.mass * dt;
      o.vy += ny * sign * f / o.mass * dt;
      a.vx -= nx * sign * f * CFG.REACTION * anchor / ma * dt;
      a.vy -= ny * sign * f * CFG.REACTION * anchor / ma * dt;
      if (f > 400) o.lastTouch = a.id;
    }
  }

  // 3) Integration
  const dampP = Math.exp(-CFG.DAMP * dt);
  const dampO = Math.exp(-CFG.OBJ_DAMP * dt);
  for (const p of s.players) {
    if (p.alive) { p.vx *= dampP; p.vy *= dampP; }
    else { p.vx *= 0.96; p.vy *= 0.96; }
    limit(p, CFG.MAX_SPEED);
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (const o of s.objects) {
    if (o.type === 'power') {
      o.life -= dt;
      continue;
    }
    if (o.spawnT > 0) { o.spawnT = Math.max(0, o.spawnT - dt); continue; }
    o.vx *= dampO; o.vy *= dampO;
    limit(o, CFG.OBJ_MAX_SPEED);
    o.x += o.vx * dt; o.y += o.vy * dt;
    if (o.fallT >= 0) o.fallT += dt;
  }

  // 4) Kollisionen
  const bodies = [...alive, ...solids];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      collide(s, bodies[i], bodies[j], ev);
    }
  }

  // Power-ups einsammeln
  for (const o of s.objects) {
    if (o.type !== 'power' || o.spawnT > 0 || o.life <= 0) continue;
    for (const p of alive) {
      if (Math.hypot(p.x - o.x, p.y - o.y) < p.r + o.r) {
        o.life = 0;
        if (o.kind === 'flip') {
          for (const q of alive) if (q !== p) q.pol = -q.pol;
        } else {
          p.eff[o.kind] = CFG.EFFECT_TIME;
        }
        ev.push({ t: 'pickup', id: p.id, kind: o.kind, x: o.x, y: o.y });
        break;
      }
    }
  }

  // 5) Ring-Out
  for (const p of alive) {
    if (Math.hypot(p.x, p.y) > s.ringR) {
      p.alive = false;
      p.fallT = 0;
      let by = null;
      if (!frozenRules && p.lastHit != null && p.lastHit !== p.id && s.t - p.lastHitT < CFG.KO_CREDIT_TIME) {
        const k = s.players.find(q => q.id === p.lastHit);
        if (k) { k.kos++; by = k.id; }
      }
      s.metaVer++;
      ev.push({ t: 'fall', id: p.id, by, x: p.x, y: p.y });
    }
  }
  for (const o of s.objects) {
    if (o.type !== 'power' && o.fallT < 0 && o.spawnT <= 0 && Math.hypot(o.x, o.y) > s.ringR) {
      o.fallT = 0;
    }
    if (o.type === 'power' && Math.hypot(o.x, o.y) > s.ringR) o.life = 0;
  }

  // 6) Bomben
  for (const o of s.objects) {
    if (o.type !== 'bomb' || o.fuse < 0) continue;
    o.fuse -= dt;
    if (o.fuse <= 0) explode(s, o, ev);
  }

  // Aufräumen
  s.objects = s.objects.filter(o =>
    !(o.type === 'power' && o.life <= 0) &&
    !(o.fallT >= 0 && o.fallT > 0.9) &&
    !o.dead);

  tickTimers(s, dt);
}

function limit(b, max) {
  const v = Math.hypot(b.vx, b.vy);
  if (v > max) { b.vx *= max / v; b.vy *= max / v; }
}

function massOf(b) { return b.type ? b.mass : playerMass(b); }

function collide(s, a, b, ev) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (d >= min || d < 1e-6) return;
  const nx = dx / d, ny = dy / d;
  const ma = massOf(a), mb = massOf(b);
  const inv = 1 / ma + 1 / mb;
  // Positionskorrektur
  const pen = min - d;
  a.x -= nx * pen * (1 / ma) / inv; a.y -= ny * pen * (1 / ma) / inv;
  b.x += nx * pen * (1 / mb) / inv; b.y += ny * pen * (1 / mb) / inv;
  // Impuls
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return;
  const bothPlayers = !a.type && !b.type;
  const e = bothPlayers ? 0.9 : 0.65;
  const j = -(1 + e) * vn / inv;
  a.vx -= j * nx / ma; a.vy -= j * ny / ma;
  b.vx += j * nx / mb; b.vy += j * ny / mb;

  const impact = -vn;
  if (impact > 140) {
    ev.push({ t: 'hit', x: a.x + nx * a.r, y: a.y + ny * a.r, s: Math.min(1, impact / 900) });
  }
  // Wer hat wen getroffen?
  if (!a.type && !b.type) {
    a.lastHit = b.id; a.lastHitT = s.t;
    b.lastHit = a.id; b.lastHitT = s.t;
  } else {
    const p = a.type ? b : a, o = a.type ? a : b;
    if (!p.type) {
      if (o.lastTouch != null && o.lastTouch !== p.id && impact > 120) { p.lastHit = o.lastTouch; p.lastHitT = s.t; }
      o.lastTouch = p.id;
      if (o.type === 'bomb' && impact > 60) lightBomb(o, p.id, ev);
    } else if (a.type === 'bomb' && impact > 260) lightBomb(a, null, ev);
    else if (b.type === 'bomb' && impact > 260) lightBomb(b, null, ev);
  }
}

function explode(s, bomb, ev) {
  bomb.dead = true;
  bomb.fuse = -1;
  ev.push({ t: 'explode', x: bomb.x, y: bomb.y });
  const R = CFG.EXPLOSION_R;
  for (const p of s.players) {
    if (!p.alive) continue;
    const dx = p.x - bomb.x, dy = p.y - bomb.y, d = Math.hypot(dx, dy) || 1;
    if (d > R) continue;
    const imp = CFG.EXPLOSION_IMPULSE * (1 - d / R) / playerMass(p);
    p.vx += dx / d * imp; p.vy += dy / d * imp;
    if (bomb.lastTouch != null && bomb.lastTouch !== p.id) { p.lastHit = bomb.lastTouch; p.lastHitT = s.t; }
  }
  for (const o of s.objects) {
    if (o === bomb || o.type === 'power' || o.dead) continue;
    const dx = o.x - bomb.x, dy = o.y - bomb.y, d = Math.hypot(dx, dy) || 1;
    if (d > R) continue;
    const imp = CFG.EXPLOSION_IMPULSE * (1 - d / R) / o.mass;
    o.vx += dx / d * imp; o.vy += dy / d * imp;
    if (o.type === 'bomb') {
      if (o.fuse < 0 || o.fuse > 0.25) o.fuse = 0.25;
      if (o.lastTouch == null) o.lastTouch = bomb.lastTouch;
    }
  }
}

// ---------------------------------------------------------------- Netzwerk-Serialisierung

const EFF_BITS = { super: 1, heavy: 2, speed: 4 };

export function effBits(p) {
  let b = 0;
  for (const k in EFF_BITS) if (p.eff[k] > 0) b |= EFF_BITS[k];
  return b;
}

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

export function snapshot(s) {
  return {
    t: r2(s.t), ph: s.phase, pt: r2(s.phaseT), rr: r1(s.ringR), rd: s.round, wn: s.winsNeeded,
    rw: s.roundWinner, mw: s.matchWinner, rt: r1(s.roundTime),
    P: s.players.map(p => [p.id, r1(p.x), r1(p.y), p.pol, p.alive ? 1 : 0, r2(p.fallT),
      r2(p.pulseT), r2(p.pulseCd), effBits(p), p.wins, p.kos, r1(p.vx), r1(p.vy)]),
    O: s.objects.map(o => [o.id, OBJ_TYPES.indexOf(o.type), r1(o.x), r1(o.y), o.charge,
      r2(o.fuse), r2(o.spawnT), r2(o.fallT), o.kind ? POWERUPS.indexOf(o.kind) : -1]),
  };
}

export function meta(s) {
  return s.players.map(p => ({ id: p.id, name: p.name, color: p.color, bot: p.bot }));
}

// Erzeugt die einheitliche "View", die der Renderer zeichnet – aus einem Snapshot + Meta.
export function viewFromSnapshot(snap, metaList) {
  const byId = new Map((metaList || []).map(m => [m.id, m]));
  return {
    t: snap.t, phase: snap.ph, phaseT: snap.pt, ringR: snap.rr, round: snap.rd,
    winsNeeded: snap.wn, roundWinner: snap.rw, matchWinner: snap.mw, roundTime: snap.rt,
    players: snap.P.map(a => {
      const m = byId.get(a[0]) || {};
      return {
        id: a[0], x: a[1], y: a[2], pol: a[3], alive: !!a[4], fallT: a[5], pulseT: a[6], pulseCd: a[7],
        eff: { super: a[8] & 1 ? 1 : 0, heavy: a[8] & 2 ? 1 : 0, speed: a[8] & 4 ? 1 : 0 },
        wins: a[9], kos: a[10], vx: a[11], vy: a[12], r: CFG.PLAYER_R,
        name: m.name || '?', color: m.color || '#fff', bot: !!m.bot,
      };
    }),
    objects: snap.O.map(a => ({
      id: a[0], type: OBJ_TYPES[a[1]], x: a[2], y: a[3], charge: a[4], fuse: a[5], spawnT: a[6], fallT: a[7],
      kind: a[8] >= 0 ? POWERUPS[a[8]] : null, r: a[1] === 0 ? 17 : 15,
    })),
  };
}
