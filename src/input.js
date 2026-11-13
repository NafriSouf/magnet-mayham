// Eingaben: Tastatur (mehrere Belegungen), Maus, Gamepads, Touch.
// Jeder lokale Spieler hat ein Input-Objekt { mx, my, tg, pu }. tg/pu sind Zähler,
// die bei jedem Tastendruck hochzählen – so geht über das Netz kein Druck verloren.

export const SCHEMES = {
  solo: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    toggle: ['Space', 'KeyQ', 'KeyJ'], pulse: ['ShiftLeft', 'ShiftRight', 'KeyE', 'KeyK'],
  },
  p1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    toggle: ['KeyQ', 'Space'], pulse: ['KeyE', 'ShiftLeft'],
  },
  p2: {
    up: ['ArrowUp', 'KeyI'], down: ['ArrowDown', 'KeyK'], left: ['ArrowLeft', 'KeyJ'], right: ['ArrowRight', 'KeyL'],
    toggle: ['Enter', 'KeyU', 'NumpadEnter', 'Numpad0'], pulse: ['ShiftRight', 'KeyO', 'ControlRight', 'NumpadDecimal'],
  },
};

export const SCHEME_LABELS = {
  solo: 'WASD/Pfeile · Leertaste/Linksklick = Pol · Shift/E/Rechtsklick = Puls',
  p1: 'WASD · Q = Pol · E = Puls',
  p2: 'Pfeile/IJKL · Enter/U = Pol · R-Shift/O = Puls',
  pad: 'Gamepad: Stick · A = Pol · B/RT = Puls',
};

const down = new Set();
const pressListeners = [];
let mouseDownToggle = 0, mouseDownPulse = 0;
let enabled = true;

export function initInput(canvas) {
  window.addEventListener('keydown', e => {
    if (isTyping(e)) return;
    if (!enabled) return;
    if (!e.repeat) { down.add(e.code); for (const f of pressListeners) f(e.code); }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) mouseDownToggle++;
    if (e.button === 2) mouseDownPulse++;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

export function setInputEnabled(v) { enabled = v; if (!v) down.clear(); }

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

// Ein lokaler Steuerer: verknüpft eine Tastaturbelegung und/oder ein Gamepad
export class Controller {
  constructor({ scheme = null, pad = null, mouse = false, touch = null } = {}) {
    this.scheme = scheme ? SCHEMES[scheme] : null;
    this.pad = pad;           // Gamepad-Index oder null
    this.mouse = mouse;
    this.touch = touch;       // TouchControls oder null
    this.state = { mx: 0, my: 0, tg: 0, pu: 0 };
    this.mt = mouseDownToggle; this.mp = mouseDownPulse;
    this.padPrev = { a: false, b: false };
    if (this.scheme) {
      this.onPress = code => {
        if (this.scheme.toggle.includes(code)) this.state.tg++;
        if (this.scheme.pulse.includes(code)) this.state.pu++;
      };
      pressListeners.push(this.onPress);
    }
  }
  dispose() {
    const i = pressListeners.indexOf(this.onPress);
    if (i >= 0) pressListeners.splice(i, 1);
  }
  poll() {
    let mx = 0, my = 0;
    const sc = this.scheme;
    if (sc) {
      if (sc.left.some(c => down.has(c))) mx -= 1;
      if (sc.right.some(c => down.has(c))) mx += 1;
      if (sc.up.some(c => down.has(c))) my -= 1;
      if (sc.down.some(c => down.has(c))) my += 1;
    }
    if (this.mouse) {
      if (mouseDownToggle !== this.mt) { this.state.tg += mouseDownToggle - this.mt; this.mt = mouseDownToggle; }
      if (mouseDownPulse !== this.mp) { this.state.pu += mouseDownPulse - this.mp; this.mp = mouseDownPulse; }
    }
    if (this.pad != null) {
      const gp = navigator.getGamepads ? navigator.getGamepads()[this.pad] : null;
      if (gp) {
        let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        if (Math.hypot(ax, ay) < 0.2) { ax = 0; ay = 0; }
        const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
        if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = -1; if (b(13)) ay = 1;
        mx += ax; my += ay;
        const a = b(0) || b(3) || b(4);
        const pu = b(1) || b(2) || b(5) || b(7) || b(6);
        if (a && !this.padPrev.a) this.state.tg++;
        if (pu && !this.padPrev.b) this.state.pu++;
        this.padPrev = { a, b: pu };
      }
    }
    if (this.touch) {
      const t = this.touch.read();
      mx += t.mx; my += t.my;
      this.state.tg += t.tg; this.state.pu += t.pu;
    }
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    this.state.mx = Math.round(mx * 100) / 100;
    this.state.my = Math.round(my * 100) / 100;
    return this.state;
  }
}

export function connectedPads() {
  if (!navigator.getGamepads) return [];
  return [...navigator.getGamepads()].filter(Boolean).map(g => g.index);
}

export const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Virtueller Joystick links + zwei Knöpfe rechts
export class TouchControls {
  constructor(root) {
    this.root = root;
    this.stick = root.querySelector('.stick');
    this.knob = root.querySelector('.knob');
    this.btnTg = root.querySelector('.btn-toggle');
    this.btnPu = root.querySelector('.btn-pulse');
    this.mx = 0; this.my = 0; this.tg = 0; this.pu = 0;
    this.stickId = null; this.cx = 0; this.cy = 0;
    const zone = root.querySelector('.stick-zone');
    zone.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.stickId = t.identifier; this.cx = t.clientX; this.cy = t.clientY;
      this.stick.style.left = this.cx + 'px'; this.stick.style.top = this.cy + 'px';
      this.stick.classList.add('active');
      this.move(t);
    }, { passive: false });
    const onMove = e => {
      for (const t of e.changedTouches) if (t.identifier === this.stickId) { e.preventDefault(); this.move(t); }
    };
    const onEnd = e => {
      for (const t of e.changedTouches) if (t.identifier === this.stickId) {
        this.stickId = null; this.mx = this.my = 0;
        this.knob.style.transform = 'translate(-50%,-50%)';
        this.stick.classList.remove('active');
      }
    };
    zone.addEventListener('touchmove', onMove, { passive: false });
    zone.addEventListener('touchend', onEnd);
    zone.addEventListener('touchcancel', onEnd);
    const btn = (el, key) => el.addEventListener('touchstart', e => {
      e.preventDefault(); this[key]++; el.classList.add('down');
      if (navigator.vibrate) navigator.vibrate(12);
    }, { passive: false });
    btn(this.btnTg, 'tg'); btn(this.btnPu, 'pu');
    for (const el of [this.btnTg, this.btnPu]) {
      el.addEventListener('touchend', () => el.classList.remove('down'));
      el.addEventListener('touchcancel', () => el.classList.remove('down'));
    }
  }
  move(t) {
    const R = 55;
    let dx = t.clientX - this.cx, dy = t.clientY - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    this.mx = dx / R; this.my = dy / R;
    if (Math.hypot(this.mx, this.my) < 0.15) { this.mx = this.my = 0; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  read() {
    const r = { mx: this.mx, my: this.my, tg: this.tg, pu: this.pu };
    this.tg = 0; this.pu = 0;
    return r;
  }
  setPolarity(pol) {
    this.btnTg.classList.toggle('plus', pol > 0);
    this.btnTg.classList.toggle('minus', pol < 0);
    this.btnTg.textContent = pol > 0 ? '+' : '−';
  }
  setCooldown(frac) {
    this.btnPu.style.setProperty('--cd', frac);
    this.btnPu.classList.toggle('ready', frac <= 0);
  }
  show(v) { this.root.classList.toggle('hidden', !v); }
}
