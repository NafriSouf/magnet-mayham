// Canvas-Renderer: Arena, Feldlinien, Spieler, Objekte, Partikel, Screenshake.
import { CFG } from './game.js';

const POL_COL = { 1: '#ff4d6d', '-1': '#4d9dff' };
const POWER_ICON = { super: '🧲', heavy: '🪨', speed: '⚡', flip: '🔄' };
const POWER_COL = { super: '#c77dff', heavy: '#adb5bd', speed: '#ffd23f', flip: '#3bceac' };

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.particles = [];
    this.rings = [];
    this.floaters = [];
    this.shake = 0;
    this.time = 0;
    this.prev = new Map();
    this.stars = Array.from({ length: 160 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.2, a: Math.random() * 0.6 + 0.2, tw: Math.random() * 6,
    }));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.c.width = Math.round(this.w * dpr);
    this.c.height = Math.round(this.h * dpr);
    this.c.style.width = this.w + 'px'; this.c.style.height = this.h + 'px';
  }

  // ------------------------------------------------ Effekte aus Spielereignissen
  handleEvent(e, view) {
    const P = id => view && view.players.find(p => p.id === id);
    switch (e.t) {
      case 'explode':
        this.shake = Math.max(this.shake, 18);
        this.rings.push({ x: e.x, y: e.y, r: 10, max: CFG.EXPLOSION_R, life: 0.45, t: 0, col: '#ffb703', w: 10 });
        for (let i = 0; i < 46; i++) {
          const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 520;
          this.particles.push({
            x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.6, t: 0,
            size: 3 + Math.random() * 6, col: ['#ffb703', '#fb8500', '#ff4d6d', '#fff3b0'][i % 4], drag: 3,
          });
        }
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 80;
          this.particles.push({
            x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 + Math.random(), t: 0,
            size: 12 + Math.random() * 14, col: 'rgba(80,80,90,0.5)', drag: 1.5, smoke: true,
          });
        }
        break;
      case 'hit': {
        const n = 3 + Math.round(e.s * 10);
        if (e.s > 0.5) this.shake = Math.max(this.shake, 6 * e.s);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 300 * e.s;
          this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.25, t: 0, size: 2 + Math.random() * 2, col: '#fff', drag: 4 });
        }
        break;
      }
      case 'pulse': {
        const p = P(e.id);
        const col = POL_COL[e.pol] || '#fff';
        this.rings.push({ x: e.x, y: e.y, r: 20, max: CFG.FIELD_RANGE * CFG.PULSE_RANGE * (p && p.eff.super ? 1.3 : 1), life: 0.35, t: 0, col, w: 6, follow: e.id });
        break;
      }
      case 'toggle': {
        const p = P(e.id);
        if (p) this.rings.push({ x: p.x, y: p.y, r: p.r, max: p.r + 26, life: 0.2, t: 0, col: POL_COL[e.pol], w: 3, follow: e.id });
        break;
      }
      case 'fall': {
        this.shake = Math.max(this.shake, 10);
        const p = P(e.id);
        const k = e.by != null ? P(e.by) : null;
        if (p) this.floaters.push({ x: e.x, y: e.y - 30, text: k ? `💥 ${k.name} hat ${p.name} rausgekickt!` : `😵 ${p.name} ist rausgefallen!`, t: 0, life: 2, col: k ? k.color : '#fff', big: false });
        for (let i = 0; i < 24; i++) {
          const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 240;
          this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.5, t: 0, size: 3 + Math.random() * 3, col: p ? p.color : '#fff', drag: 2.5 });
        }
        break;
      }
      case 'pickup': {
        const label = { super: 'SUPERMAGNET!', heavy: 'SCHWERGEWICHT!', speed: 'TURBO!', flip: 'POLE GEDREHT!' }[e.kind];
        this.floaters.push({ x: e.x, y: e.y - 20, text: `${POWER_ICON[e.kind]} ${label}`, t: 0, life: 1.4, col: POWER_COL[e.kind] });
        this.rings.push({ x: e.x, y: e.y, r: 10, max: e.kind === 'flip' ? 900 : 70, life: e.kind === 'flip' ? 0.6 : 0.4, t: 0, col: POWER_COL[e.kind], w: 4 });
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
          this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, t: 0, size: 2 + Math.random() * 3, col: POWER_COL[e.kind], drag: 3, star: true });
        }
        break;
      }
    }
  }

  // ------------------------------------------------ Kamera
  camera() {
    const margin = 40;
    const s = Math.min(this.w, this.h - 70) / (2 * CFG.ARENA_R + margin * 2);
    let sx = 0, sy = 0;
    if (this.shake > 0.1) {
      sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake;
    }
    return { s, ox: this.w / 2 + sx, oy: (this.h + 50) / 2 + sy };
  }

  // ------------------------------------------------ Zeichnen
  draw(view, dt, localIds = []) {
    this.time += dt;
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground();
    if (!view) return;

    const cam = this.camera();
    g.save();
    g.translate(cam.ox, cam.oy);
    g.scale(cam.s, cam.s);

    this.drawArena(view);
    this.drawFieldLinks(view);
    this.drawObjects(view, 'shadow');
    for (const p of view.players) if (p.alive) this.drawAura(p, localIds.includes(p.id));
    this.drawObjects(view, 'body');
    this.updateRings(dt, view);
    const sorted = [...view.players].sort((a, b) => (a.alive - b.alive) || (a.y - b.y));
    for (const p of sorted) this.drawPlayer(p, localIds.includes(p.id), view);
    this.updateParticles(dt);
    this.updateFloaters(dt, cam.s);
    g.restore();

    this.shake *= Math.pow(0.0005, dt);

    // Positionsverlauf für Augen/Trails
    for (const p of view.players) this.prev.set(p.id, { x: p.x, y: p.y });
  }

  drawBackground() {
    const g = this.g;
    const grd = g.createRadialGradient(this.w / 2, this.h / 2, 0, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    grd.addColorStop(0, '#1a1438');
    grd.addColorStop(1, '#07060f');
    g.fillStyle = grd;
    g.fillRect(0, 0, this.w, this.h);
    for (const st of this.stars) {
      g.globalAlpha = st.a * (0.6 + 0.4 * Math.sin(this.time * 1.5 + st.tw));
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(st.x * this.w, st.y * this.h, st.r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }

  drawArena(v) {
    const g = this.g, R = v.ringR, A = CFG.ARENA_R;
    // Ursprünglicher Rand (bröckelnd)
    if (R < A - 1) {
      g.save();
      g.globalAlpha = 0.25;
      g.strokeStyle = '#6c5ce7';
      g.setLineDash([10, 14]);
      g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, A, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    // Plattform-Seite (3D-Kante)
    g.fillStyle = '#120f26';
    g.beginPath(); g.ellipse(0, 14, R, R, 0, 0, Math.PI * 2); g.fill();
    // Boden
    const floor = g.createRadialGradient(0, -R * 0.3, R * 0.1, 0, 0, R);
    floor.addColorStop(0, '#2d2a5a');
    floor.addColorStop(1, '#1b1840');
    g.fillStyle = floor;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();

    // Gitter
    g.save();
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
    g.strokeStyle = 'rgba(140,130,255,0.08)';
    g.lineWidth = 2;
    const step = 55;
    g.beginPath();
    for (let x = -A; x <= A; x += step) { g.moveTo(x, -A); g.lineTo(x, A); }
    for (let y = -A; y <= A; y += step) { g.moveTo(-A, y); g.lineTo(A, y); }
    g.stroke();
    // Mittelkreis
    g.strokeStyle = 'rgba(140,130,255,0.15)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.stroke();
    // Warnzone am Rand
    const warn = g.createRadialGradient(0, 0, R - 70, 0, 0, R);
    warn.addColorStop(0, 'rgba(255,60,90,0)');
    warn.addColorStop(1, 'rgba(255,60,90,0.22)');
    g.fillStyle = warn;
    g.fillRect(-R, -R, 2 * R, 2 * R);
    g.restore();

    // Leuchtender Rand
    const shrinking = v.phase === 'play' && v.roundTime > CFG.SHRINK_START && R > CFG.RING_MIN;
    const pulse = shrinking ? 0.5 + 0.5 * Math.sin(this.time * 10) : 0;
    g.save();
    g.shadowColor = shrinking ? '#ff4d6d' : '#8c7bff';
    g.shadowBlur = 25;
    g.strokeStyle = shrinking ? `rgb(255,${90 + pulse * 80},${120 + pulse * 40})` : '#a99bff';
    g.lineWidth = 6;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  drawFieldLinks(v) {
    const g = this.g;
    const alive = v.players.filter(p => p.alive);
    g.save();
    g.lineCap = 'round';
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const R = Math.max(rangeOf(a), rangeOf(b));
        if (d >= R) continue;
        const k = 1 - d / R;
        const attract = a.pol !== b.pol;
        g.globalAlpha = Math.min(0.9, k * 1.4);
        g.lineWidth = 2 + k * 5;
        if (attract) {
          const grd = g.createLinearGradient(a.x, a.y, b.x, b.y);
          grd.addColorStop(0, POL_COL[a.pol]); grd.addColorStop(1, POL_COL[b.pol]);
          g.strokeStyle = grd;
          g.setLineDash([14, 10]);
          g.lineDashOffset = -this.time * 80;
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        } else {
          // Abstoßung: zwei gebogene "Wellen" zwischen den Spielern
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
          g.strokeStyle = POL_COL[a.pol];
          g.setLineDash([]);
          for (const off of [-12, 0, 12]) {
            const cx = mx + nx * off, cy = my + ny * off;
            const w = 14 + k * 18;
            g.beginPath();
            g.moveTo(cx - ny * w, cy + nx * w);
            g.quadraticCurveTo(cx + nx * 8 * Math.sign(off || 1), cy + ny * 8 * Math.sign(off || 1), cx + ny * w, cy - nx * w);
            g.stroke();
          }
        }
      }
    }
    g.restore();
  }

  drawAura(p, isLocal) {
    const g = this.g;
    const R = rangeOf(p);
    const col = POL_COL[p.pol];
    const grd = g.createRadialGradient(p.x, p.y, p.r, p.x, p.y, R);
    grd.addColorStop(0, hexA(col, p.pulseT > 0 ? 0.35 : 0.12));
    grd.addColorStop(1, hexA(col, 0));
    g.fillStyle = grd;
    g.beginPath(); g.arc(p.x, p.y, R, 0, Math.PI * 2); g.fill();
    if (isLocal) {
      g.save();
      g.globalAlpha = 0.18;
      g.strokeStyle = col;
      g.setLineDash([6, 10]);
      g.lineDashOffset = this.time * 20 * p.pol;
      g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, R, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  }

  drawObjects(v, pass) {
    const g = this.g;
    for (const o of v.objects) {
      let x = o.x, y = o.y, scale = 1, alpha = 1, lift = 0;
      if (o.spawnT > 0) { lift = o.spawnT / 0.7 * 300; alpha = 1 - o.spawnT / 0.7 * 0.6; }
      if (o.fallT >= 0) { scale = Math.max(0, 1 - o.fallT / 0.9); alpha = scale; }
      if (o.type === 'power') lift = 6 + Math.sin(this.time * 4 + o.id) * 4;
      if (pass === 'shadow') {
        if (o.fallT >= 0) continue;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        const sh = 1 - Math.min(1, lift / 300) * 0.6;
        g.beginPath(); g.ellipse(x, y + 6, o.r * sh, o.r * 0.6 * sh, 0, 0, Math.PI * 2); g.fill();
        if (o.spawnT > 0) {
          g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, o.r + 8 * (o.spawnT / 0.7), 0, Math.PI * 2); g.stroke();
        }
        continue;
      }
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y - lift);
      g.scale(scale, scale);
      if (o.type === 'crate') this.drawCrate(o);
      else if (o.type === 'bomb') this.drawBomb(o);
      else this.drawPower(o);
      g.restore();
    }
  }

  drawCrate(o) {
    const g = this.g, r = o.r, col = POL_COL[o.charge];
    g.rotate((o.id * 0.7) % Math.PI);
    g.fillStyle = '#6b4f2a';
    roundRect(g, -r, -r, 2 * r, 2 * r, 5); g.fill();
    g.strokeStyle = col; g.lineWidth = 3.5;
    roundRect(g, -r, -r, 2 * r, 2 * r, 5); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-r + 4, -r + 4); g.lineTo(r - 4, r - 4); g.moveTo(r - 4, -r + 4); g.lineTo(-r + 4, r - 4); g.stroke();
    g.rotate(-((o.id * 0.7) % Math.PI));
    g.fillStyle = col;
    g.font = 'bold 18px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(o.charge > 0 ? '+' : '−', 0, 1);
  }

  drawBomb(o) {
    const g = this.g, r = o.r;
    const lit = o.fuse >= 0;
    const blink = lit && Math.sin(this.time * (8 + (2 - o.fuse) * 14)) > 0;
    g.fillStyle = blink ? '#ff3355' : '#1d1d24';
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = POL_COL[o.charge]; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.arc(-r * 0.35, -r * 0.35, r * 0.28, 0, Math.PI * 2); g.fill();
    // Zündschnur
    g.strokeStyle = '#c9a26b'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(6, -r - 8, 10, -r - 6); g.stroke();
    if (lit) {
      g.fillStyle = Math.random() > 0.5 ? '#ffd23f' : '#ff8c42';
      g.beginPath(); g.arc(10, -r - 6, 4 + Math.random() * 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,60,80,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, r + 6 + Math.sin(this.time * 20) * 2, 0, Math.PI * 2 * Math.max(0, o.fuse / CFG.BOMB_FUSE)); g.stroke();
    }
    g.fillStyle = '#fff';
    g.font = 'bold 13px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(o.charge > 0 ? '+' : '−', 0, 1);
  }

  drawPower(o) {
    const g = this.g, col = POWER_COL[o.kind];
    g.save();
    g.shadowColor = col; g.shadowBlur = 20;
    g.fillStyle = hexA(col, 0.25);
    g.strokeStyle = col; g.lineWidth = 3;
    g.rotate(this.time * 1.5);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      g.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
    }
    g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.font = '18px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(POWER_ICON[o.kind], 0, 1);
  }

  drawPlayer(p, isLocal, view) {
    const g = this.g;
    let scale = 1, alpha = 1, rot = 0;
    if (!p.alive) {
      if (p.fallT > 1.2) return;
      scale = Math.max(0, 1 - p.fallT / 1.2);
      alpha = scale;
      rot = p.fallT * 8;
    }
    const col = POL_COL[p.pol];
    const prev = this.prev.get(p.id);
    let vx = p.vx || 0, vy = p.vy || 0;
    if ((!vx && !vy) && prev) { vx = (p.x - prev.x) * 60; vy = (p.y - prev.y) * 60; }

    // Schatten
    if (p.alive) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(p.x, p.y + 8, p.r, p.r * 0.55, 0, 0, Math.PI * 2); g.fill();
    }
    // Turbo-Spur
    if (p.alive && p.eff.speed) {
      for (let i = 1; i <= 4; i++) {
        g.globalAlpha = 0.12 * (5 - i) / 4;
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x - vx * 0.02 * i, p.y - vy * 0.02 * i, p.r * (1 - i * 0.1), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }

    g.save();
    g.globalAlpha = alpha;
    g.translate(p.x, p.y);
    g.scale(scale, scale);
    g.rotate(rot);

    const r = p.r * (p.eff.heavy ? 1.12 : 1);
    // Polaritätsring mit Glow
    g.save();
    g.shadowColor = col;
    g.shadowBlur = p.pulseT > 0 ? 40 : 18;
    g.fillStyle = col;
    g.beginPath(); g.arc(0, 0, r + 5, 0, Math.PI * 2); g.fill();
    g.restore();
    // Körper
    const body = g.createRadialGradient(-r * 0.3, -r * 0.4, 2, 0, 0, r);
    body.addColorStop(0, lighten(p.color, 0.35));
    body.addColorStop(1, p.color);
    g.fillStyle = body;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    if (p.eff.heavy) {
      g.strokeStyle = '#495057'; g.lineWidth = 4;
      g.beginPath(); g.arc(0, 0, r - 2, 0, Math.PI * 2); g.stroke();
    }
    // Hufeisen-Symbol: Pol-Zeichen oben
    g.fillStyle = col;
    g.beginPath(); g.arc(0, -r + 1, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 15px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.pol > 0 ? '+' : '−', 0, -r + 1.5);

    // Augen schauen in Bewegungsrichtung
    const sp = Math.hypot(vx, vy);
    const lx = sp > 20 ? vx / sp * 3.5 : 0, ly = sp > 20 ? vy / sp * 3.5 : 0;
    const scared = !p.alive || (Math.hypot(p.x, p.y) > view.ringR - 55);
    for (const ex of [-7, 7]) {
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(ex, 3, scared ? 6 : 5.5, scared ? 7 : 6.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111';
      g.beginPath(); g.arc(ex + lx, 3 + ly, scared ? 2 : 3, 0, Math.PI * 2); g.fill();
    }
    if (scared) {
      g.fillStyle = '#111';
      g.beginPath(); g.ellipse(0, 14, 4, 3, 0, 0, Math.PI * 2); g.fill();
    }
    // Supermagnet-Funken
    if (p.eff.super) {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 5 + i * 2.1;
        g.fillStyle = '#e0aaff';
        g.beginPath(); g.arc(Math.cos(a) * (r + 10), Math.sin(a) * (r + 10), 2.5, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();

    if (!p.alive) return;
    // Puls-Abklingzeit (Bogen)
    if (p.pulseCd > 0) {
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(p.x, p.y, r + 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.pulseCd / CFG.PULSE_CD));
      g.stroke();
    }
    // Namensschild
    g.font = `bold ${isLocal ? 15 : 13}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    const label = (isLocal ? '▼ ' : '') + p.name;
    g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(label, p.x, p.y - r - 16);
    g.fillStyle = isLocal ? '#fff' : p.color;
    g.fillText(label, p.x, p.y - r - 16);
  }

  updateRings(dt, view) {
    const g = this.g;
    for (const r of this.rings) {
      r.t += dt;
      if (r.follow != null) {
        const p = view.players.find(q => q.id === r.follow);
        if (p) { r.x = p.x; r.y = p.y; }
      }
      const k = r.t / r.life;
      const rad = r.r + (r.max - r.r) * easeOut(k);
      g.globalAlpha = Math.max(0, 1 - k);
      g.strokeStyle = r.col;
      g.lineWidth = r.w * (1 - k) + 1;
      g.beginPath(); g.arc(r.x, r.y, rad, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
    this.rings = this.rings.filter(r => r.t < r.life);
  }

  updateParticles(dt) {
    const g = this.g;
    for (const p of this.particles) {
      p.t += dt;
      const d = Math.exp(-(p.drag || 0) * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.t / p.life;
      g.globalAlpha = Math.max(0, k);
      g.fillStyle = p.col;
      const sz = p.smoke ? p.size * (2 - k) : p.size * k;
      if (p.star) {
        g.save(); g.translate(p.x, p.y); g.rotate(p.t * 6);
        g.fillRect(-sz / 2, -sz / 2, sz, sz);
        g.restore();
      } else {
        g.beginPath(); g.arc(p.x, p.y, Math.max(0.1, sz), 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
    this.particles = this.particles.filter(p => p.t < p.life);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  updateFloaters(dt, camScale) {
    const g = this.g;
    for (const f of this.floaters) {
      f.t += dt;
      const k = f.t / f.life;
      g.globalAlpha = k < 0.8 ? 1 : Math.max(0, (1 - k) / 0.2);
      const fs = 16 / Math.max(0.45, camScale);
      g.font = `900 ${fs}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const y = f.y - easeOut(Math.min(1, k * 2)) * 40;
      g.lineWidth = fs / 4; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(f.text, f.x, y);
      g.fillStyle = f.col;
      g.fillText(f.text, f.x, y);
    }
    g.globalAlpha = 1;
    this.floaters = this.floaters.filter(f => f.t < f.life);
  }

  reset() { this.particles = []; this.rings = []; this.floaters = []; this.shake = 0; this.prev.clear(); }
}

function rangeOf(p) {
  return CFG.FIELD_RANGE * (p.pulseT > 0 ? CFG.PULSE_RANGE : 1) * (p.eff.super ? 1.3 : 1);
}
function easeOut(t) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); }
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.round(c + (255 - c) * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
