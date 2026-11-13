// Einfache, aber gemeine KI für Magnet Mayhem.
import { fieldRange } from './game.js';

const LEVELS = {
  easy:   { react: 0.32, noise: 0.55, pulseSkill: 0.35, edgeFear: 90 },
  normal: { react: 0.16, noise: 0.25, pulseSkill: 0.7,  edgeFear: 115 },
  hard:   { react: 0.06, noise: 0.08, pulseSkill: 0.95, edgeFear: 135 },
};

export function botThink(s, p, dt) {
  if (!p.alive) return;
  const L = LEVELS[p.difficulty] || LEVELS.normal;
  const ai = p.ai || (p.ai = { next: 0, mx: 0, my: 0, tg: p.input.tg, pu: p.input.pu, wander: s.rand() * 6.28 });
  ai.next -= dt;
  if (ai.next <= 0 && (s.phase === 'play' || s.phase === 'countdown' || s.phase === 'roundEnd' || s.phase === 'matchEnd')) {
    ai.next = L.react * (0.7 + s.rand() * 0.6);
    decide(s, p, ai, L);
  }
  p.input.mx = ai.mx;
  p.input.my = ai.my;
  p.input.tg = ai.tg;
  p.input.pu = ai.pu;
}

function decide(s, p, ai, L) {
  const dc = Math.hypot(p.x, p.y);
  const edge = s.ringR - dc;
  let mx = 0, my = 0;

  // Ziel: nächster lebender Gegner
  let target = null, best = Infinity;
  for (const q of s.players) {
    if (q === p || !q.alive) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best) { best = d; target = q; }
  }

  let wantPol = p.pol;
  if (target) {
    const tl = Math.hypot(target.x, target.y);
    let tnx, tny;
    if (tl > 25) { tnx = target.x / tl; tny = target.y / tl; }
    else { tnx = (target.x - p.x) / (best || 1); tny = (target.y - p.y) / (best || 1); }
    // Position "hinter" dem Gegner (Richtung Mitte), um ihn nach außen zu drücken
    const gx = target.x - tnx * 95, gy = target.y - tny * 95;
    const gdx = gx - p.x, gdy = gy - p.y, gd = Math.hypot(gdx, gdy) || 1;
    mx = gdx / gd; my = gdy / gd;

    const iAmOutside = dc > tl + 15;
    wantPol = iAmOutside ? -target.pol : target.pol;

    // Puls, wenn gut ausgerichtet
    const ax = (target.x - p.x) / (best || 1), ay = (target.y - p.y) / (best || 1);
    const align = ax * tnx + ay * tny;
    if (s.phase === 'play' && p.pulseCd <= 0 && best < fieldRange(p) * 0.7 &&
        p.pol === target.pol && align > 0.45 && s.rand() < L.pulseSkill) {
      ai.pu++;
    }
  } else {
    ai.wander += (s.rand() - 0.5) * 1.5;
    const wx = Math.cos(ai.wander) * s.ringR * 0.3, wy = Math.sin(ai.wander) * s.ringR * 0.3;
    const d = Math.hypot(wx - p.x, wy - p.y) || 1;
    mx = (wx - p.x) / d * 0.5; my = (wy - p.y) / d * 0.5;
  }

  // Power-ups mitnehmen, wenn nah
  for (const o of s.objects) {
    if (o.type !== 'power' || o.spawnT > 0) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < 170 && Math.hypot(o.x, o.y) < s.ringR - 70) {
      mx = mx * 0.3 + (o.x - p.x) / d * 0.9; my = my * 0.3 + (o.y - p.y) / d * 0.9;
      break;
    }
  }

  // Brennenden Bomben ausweichen
  for (const o of s.objects) {
    if (o.type !== 'bomb' || o.fuse < 0) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y) || 1;
    if (d < 190) {
      const w = (190 - d) / 190 * 2.2;
      mx += (p.x - o.x) / d * w; my += (p.y - o.y) / d * w;
      // Bombe abstoßen
      if (d < 120) wantPol = o.charge;
    }
  }

  // Rand meiden
  if (edge < L.edgeFear && dc > 1) {
    const w = (L.edgeFear - edge) / L.edgeFear * 3;
    mx -= p.x / dc * w; my -= p.y / dc * w;
    // Gegen die Außenbewegung: falls schnell nach außen, Pol so wählen, dass man angezogen wird
    const outward = (p.vx * p.x + p.vy * p.y) / dc;
    if (outward > 200 && target) wantPol = -target.pol;
  }

  // Rauschen
  mx += (s.rand() - 0.5) * L.noise * 2;
  my += (s.rand() - 0.5) * L.noise * 2;
  const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  ai.mx = mx; ai.my = my;

  // Hysterese: erst umschalten, wenn der Wunsch zweimal hintereinander besteht
  if (wantPol !== p.pol) {
    ai.want = (ai.want || 0) + 1;
    if (ai.want >= 2 && p.togCd <= 0 && s.rand() < 0.4 + L.pulseSkill * 0.6) { ai.tg++; ai.want = 0; }
  } else ai.want = 0;
}
