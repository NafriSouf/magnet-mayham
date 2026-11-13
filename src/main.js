// Magnet Mayhem – App-Steuerung: Menüs, Spielschleife, lokal / Host / Client / Demo.
import {
  createGame, addPlayer, removePlayer, setInput, startMatch, step, snapshot, meta,
  viewFromSnapshot, CFG,
} from './game.js';
import { botThink } from './bot.js';
import { Renderer } from './render.js';
import { initInput, Controller, TouchControls, isTouchDevice, connectedPads, SCHEME_LABELS } from './input.js';
import { sfx, unlockAudio, isMuted, setMuted } from './audio.js';
import { HostNet, ClientNet, normalizeCode } from './net.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const DT = 1 / 60;
const MAX_PLAYERS = 8;
const BOT_NAMES = ['Magnetus', 'Ferro', 'Polly', 'Zappo', 'Neodym', 'Kobalt', 'Volta', 'Tesla', 'Ampère', 'Gauss', 'Faraday', 'Nickel'];

const canvas = $('#cv');
const renderer = new Renderer(canvas);
initInput(canvas);
const touch = new TouchControls($('#touch'));
const useTouch = isTouchDevice();

// ---------------------------------------------------------------- Zustand
const app = {
  mode: 'demo',         // demo | local | host | client
  game: null,           // Simulation (demo/local/host)
  locals: [],           // [{ playerId, ctrl }]
  host: null,
  client: null,
  acc: 0,
  last: performance.now(),
  tickN: 0,
  pendingEvents: [],
  sentMetaVer: -1,
  metaTimer: 0,
  // Client
  snaps: [],
  clientMeta: [],
  clockOff: null,
  lastSent: null,
  sendTimer: 0,
  // UI
  screen: 'menu',
  lastPhase: null,
  hudKey: '',
  hintTimer: 0,
  nextBotId: 100,
  settings: { humans: 1, bots: 3, diff: 'normal', wins: 3, onlineDiff: 'normal' },
};

try {
  const saved = JSON.parse(localStorage.getItem('mm-settings') || '{}');
  Object.assign(app.settings, saved);
} catch { /* egal */ }
const saveSettings = () => { try { localStorage.setItem('mm-settings', JSON.stringify(app.settings)); } catch { /* egal */ } };

function getName() {
  const n = $('#in-name').value.trim();
  return n || 'Magnetmensch';
}

// ---------------------------------------------------------------- Screens
function show(screen) {
  app.screen = screen;
  for (const id of ['menu', 'local', 'lobby', 'end']) $('#screen-' + id).classList.toggle('hidden', id !== screen);
  const inGame = screen === 'game' || screen === 'end';
  $('#hud').classList.toggle('hidden', !inGame);
  touch.show(useTouch && screen === 'game' && app.locals.length > 0);
}

let toastTimer = 0;
function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), error ? 4500 : 2600);
}

// ---------------------------------------------------------------- Demo im Hintergrund
function startDemo() {
  cleanup();
  app.mode = 'demo';
  app.game = createGame({ winsNeeded: 99 });
  for (let i = 0; i < 4; i++) addPlayer(app.game, { id: i + 1, name: BOT_NAMES[i], bot: true, difficulty: i % 2 ? 'normal' : 'easy' });
  startMatch(app.game);
  renderer.reset();
  show('menu');
}

function cleanup() {
  for (const l of app.locals) l.ctrl.dispose();
  app.locals = [];
  if (app.host) { app.host.close(); app.host = null; }
  if (app.client) { app.client.onClose = null; app.client.close(); app.client = null; }
  app.snaps = []; app.clientMeta = []; app.clockOff = null;
  app.pendingEvents = []; app.sentMetaVer = -1;
  app.lastPhase = null; app.hudKey = '';
  app.acc = 0;
  renderer.reset();
}

// ---------------------------------------------------------------- Lokales Spiel
function localControllers(humans) {
  const out = [];
  const pads = connectedPads();
  if (humans === 1) {
    out.push({ scheme: 'solo', mouse: true, pad: pads.length ? pads[0] : 0, touch: useTouch ? touch : null });
  } else {
    out.push({ scheme: 'p1', pad: 0, touch: useTouch ? touch : null });
    out.push({ scheme: 'p2', pad: 1 });
    if (humans >= 3) out.push({ scheme: null, pad: 2 });
    if (humans >= 4) out.push({ scheme: null, pad: 3 });
  }
  return out;
}

function updateLocalCtrlInfo() {
  const h = app.settings.humans;
  const pads = connectedPads().length;
  let html;
  if (h === 1) html = `<b>Du:</b> ${SCHEME_LABELS.solo}` + (useTouch ? '<br><b>Touch:</b> Joystick links, Knöpfe rechts' : '');
  else {
    html = `<b>Spieler 1:</b> ${SCHEME_LABELS.p1} (oder Gamepad 1)<br><b>Spieler 2:</b> ${SCHEME_LABELS.p2} (oder Gamepad 2)`;
    if (h >= 3) html += `<br><b>Spieler 3${h >= 4 ? '+4' : ''}:</b> Gamepad 3${h >= 4 ? '+4' : ''}`;
    if (h >= 3 && pads < h) html += `<br><span class="warn">⚠ ${pads} Gamepad(s) erkannt – drück einen Knopf am Controller.</span>`;
  }
  $('#local-ctrl-info').innerHTML = html;
}

function startLocal() {
  cleanup();
  const st = app.settings;
  app.mode = 'local';
  const g = app.game = createGame({ winsNeeded: st.wins });
  const ctrls = localControllers(st.humans);
  ctrls.forEach((c, i) => {
    const id = i + 1;
    addPlayer(g, { id, name: i === 0 ? getName() : `Spieler ${i + 1}` });
    app.locals.push({ playerId: id, ctrl: new Controller(c), scheme: c.scheme });
  });
  const total = Math.min(MAX_PLAYERS, st.humans + st.bots);
  if (total < 2) addBot(g, st.diff);
  for (let i = st.humans; i < total; i++) addBot(g, st.diff);
  startMatch(g);
  app.hintTimer = 9;
  show('game');
}

function addBot(g, difficulty) {
  const used = new Set(g.players.map(p => p.name));
  const name = BOT_NAMES.find(n => !used.has(n)) || 'Bot ' + app.nextBotId;
  return addPlayer(g, { id: app.nextBotId++, name, bot: true, difficulty });
}

// ---------------------------------------------------------------- Host
async function startHost() {
  cleanup();
  app.mode = 'host';
  const g = app.game = createGame({ winsNeeded: app.settings.wins });
  addPlayer(g, { id: 1, name: getName() });
  app.locals.push({ playerId: 1, ctrl: new Controller({ scheme: 'solo', mouse: true, pad: 0, touch: useTouch ? touch : null }), scheme: 'solo' });
  const host = app.host = new HostNet();
  let nextId = 2;
  host.onJoin = (peerId, name) => {
    if (g.players.length >= MAX_PLAYERS) return { error: 'Der Raum ist voll (max. 8).' };
    let n = name, k = 2;
    while (g.players.some(p => p.name === n)) n = `${name.slice(0, 13)} ${k++}`;
    const p = addPlayer(g, { id: nextId++, name: n });
    if (g.phase !== 'lobby') { p.alive = false; p.fallT = 99; }
    toast(`👋 ${n} ist beigetreten`);
    sfx.pickup();
    renderLobby();
    return p.id;
  };
  host.onLeave = id => {
    const p = g.players.find(q => q.id === id);
    if (p) toast(`👋 ${p.name} hat das Spiel verlassen`);
    removePlayer(g, id);
    renderLobby();
  };
  host.onInput = (id, msg) => setInput(g, id, msg);

  show('lobby');
  $('#lobby-code').textContent = '····';
  $('#lobby-status').textContent = 'Raum wird erstellt…';
  renderLobby();
  try {
    const code = await host.start();
    if (app.host !== host) { host.close(); return; }
    $('#lobby-code').textContent = code;
    history.replaceState(null, '', shareUrl(code, false));
    renderLobby();
  } catch (e) {
    if (app.host !== host) return;
    toast(e.message, true);
    startDemo();
  }
}

function shareUrl(code, absolute = true) {
  const u = new URL(location.href);
  u.searchParams.set('room', code);
  return absolute ? u.toString() : u.pathname + u.search;
}

function renderLobby() {
  if (app.screen !== 'lobby') return;
  const isHost = app.mode === 'host';
  const players = isHost ? meta(app.game) : app.clientMeta;
  const myId = app.locals[0] && app.locals[0].playerId;
  const ul = $('#lobby-players');
  ul.innerHTML = '';
  for (const p of players) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.color; dot.style.color = p.color;
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = p.name;
    const tag = document.createElement('span'); tag.className = 'tag';
    tag.textContent = p.id === 1 ? 'Host' : p.bot ? '🤖 Bot' : (p.id === myId ? 'Du' : '');
    if (p.id === myId && p.id !== 1) tag.textContent = 'Du';
    li.append(dot, nm, tag);
    if (isHost && p.id !== 1) {
      const kick = document.createElement('button'); kick.className = 'kick'; kick.title = 'Entfernen'; kick.textContent = '✕';
      kick.onclick = () => {
        if (!p.bot) app.host.kick(p.id);
        removePlayer(app.game, p.id);
        renderLobby();
      };
      li.append(kick);
    }
    ul.append(li);
  }
  for (let i = players.length; i < 2; i++) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="dot" style="background:#333"></span><span class="name muted">Warte auf Spieler…</span>';
    ul.append(li);
  }
  $('#lobby-host-controls').classList.toggle('hidden', !isHost);
  $('#btn-online-start').classList.toggle('hidden', !isHost);
  $('#btn-add-bot').disabled = !isHost || players.length >= MAX_PLAYERS;
  const status = $('#lobby-status');
  if (isHost) {
    const code = app.host && app.host.code;
    if (code) status.textContent = players.length < 2 ? 'Teile den Code oder Link – oder füge Bots hinzu.' : `${players.length} Spieler bereit.`;
    $('#btn-online-start').disabled = players.length < 2 || !code;
  } else {
    status.textContent = 'Warte, bis der Host das Spiel startet…';
  }
}

// ---------------------------------------------------------------- Client
async function startClient(code) {
  code = normalizeCode(code);
  if (code.length < 4) { toast('Bitte gib einen gültigen Raumcode ein.', true); return; }
  cleanup();
  app.mode = 'client';
  const client = app.client = new ClientNet();
  $('#btn-join').disabled = true;
  toast(`Verbinde mit Raum ${code}…`);
  try {
    const id = await client.join(code, getName());
    if (app.client !== client) return;
    app.locals.push({ playerId: id, ctrl: new Controller({ scheme: 'solo', mouse: true, pad: 0, touch: useTouch ? touch : null }), scheme: 'solo' });
    client.onMessage = onClientMessage;
    client.onClose = reason => { toast(reason, true); startDemo(); };
    $('#lobby-code').textContent = code;
    history.replaceState(null, '', shareUrl(code, false));
    app.game = null;
    show('lobby');
    renderLobby();
    toast('✅ Verbunden!');
  } catch (e) {
    if (app.client !== client) return;
    toast(e.message || 'Beitreten fehlgeschlagen.', true);
    startDemo();
  } finally {
    $('#btn-join').disabled = false;
  }
}

function onClientMessage(msg) {
  if (msg.t === 'meta') {
    app.clientMeta = msg.m;
    for (const s of app.snaps) s.view = viewFromSnapshot(s.raw, app.clientMeta);
    renderLobby();
  } else if (msg.t === 'snap') {
    const s = msg.s;
    const now = performance.now() / 1000;
    const newest = app.snaps[app.snaps.length - 1];
    if (newest && s.t < newest.t - 1) app.snaps = [];
    const off = s.t - now;
    if (app.clockOff == null || off > app.clockOff) app.clockOff = off;
    else app.clockOff += (off - app.clockOff) * 0.02;
    app.snaps.push({ t: s.t, raw: s, view: viewFromSnapshot(s, app.clientMeta) });
    if (app.snaps.length > 30) app.snaps.shift();
    const view = app.snaps[app.snaps.length - 1].view;
    if (msg.e) for (const e of msg.e) onGameEvent(e, view);
  }
}

const INTERP = 0.1;
function clientView() {
  const snaps = app.snaps;
  if (!snaps.length) return null;
  const rt = performance.now() / 1000 + app.clockOff - INTERP;
  let a = snaps[0], b = null;
  for (let i = 0; i < snaps.length; i++) {
    if (snaps[i].t <= rt) a = snaps[i];
    else { b = snaps[i]; break; }
  }
  if (!b || a === b) return a.view;
  const k = Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t || 1)));
  const va = a.view, vb = b.view;
  const pa = new Map(va.players.map(p => [p.id, p]));
  const oa = new Map(va.objects.map(o => [o.id, o]));
  const lerp = (x, y) => x + (y - x) * k;
  return {
    ...vb,
    ringR: lerp(va.ringR, vb.ringR),
    players: vb.players.map(p => {
      const q = pa.get(p.id);
      if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 200) return p;
      return { ...p, x: lerp(q.x, p.x), y: lerp(q.y, p.y) };
    }),
    objects: vb.objects.map(o => {
      const q = oa.get(o.id);
      if (!q || Math.hypot(o.x - q.x, o.y - q.y) > 200) return o;
      return { ...o, x: lerp(q.x, o.x), y: lerp(q.y, o.y) };
    }),
  };
}

// ---------------------------------------------------------------- Ereignisse -> Sound/FX
function onGameEvent(e, view) {
  renderer.handleEvent(e, view);
  if (app.mode === 'demo') return;
  const local = id => app.locals.some(l => l.playerId === id);
  switch (e.t) {
    case 'toggle': if (local(e.id)) sfx.toggle(e.pol); break;
    case 'pulse': sfx.pulse(); break;
    case 'hit': sfx.hit(e.s); break;
    case 'explode': sfx.explode(); if (navigator.vibrate) navigator.vibrate(60); break;
    case 'fuse': sfx.fuse(); break;
    case 'fall': sfx.fall(); if (e.by != null && local(e.by)) sfx.ko(); if (local(e.id) && navigator.vibrate) navigator.vibrate([80, 40, 80]); break;
    case 'pickup': sfx.pickup(); break;
    case 'count': sfx.count(); break;
    case 'go': sfx.go(); break;
    case 'roundEnd': if (e.id != null && e.id >= 0) sfx.win(); break;
    case 'match': sfx.win(); break;
  }
}

// ---------------------------------------------------------------- Simulation (Host/Lokal/Demo)
function simTick() {
  const g = app.game;
  for (const l of app.locals) setInput(g, l.playerId, l.ctrl.poll());
  for (const p of g.players) if (p.bot) botThink(g, p, DT);
  const ev = step(g, DT);
  for (const e of ev) onGameEvent(e, g);
  if (app.mode === 'demo' && g.phase === 'matchEnd') startMatch(g);
  if (app.mode === 'host') {
    app.pendingEvents.push(...ev);
    app.tickN++;
    const rate = g.phase === 'lobby' ? 6 : 2; // 10 bzw. 30 Snapshots/s
    if (app.tickN % rate === 0 && app.host) {
      if (g.metaVer !== app.sentMetaVer || app.tickN % 120 === 0) {
        app.host.broadcast({ t: 'meta', m: meta(g) });
        app.sentMetaVer = g.metaVer;
      }
      app.host.broadcast({ t: 'snap', s: snapshot(g), e: app.pendingEvents.map(roundEvent) });
      app.pendingEvents = [];
    }
  }
}

function roundEvent(e) {
  const o = { ...e };
  for (const k of ['x', 'y', 's']) if (typeof o[k] === 'number') o[k] = Math.round(o[k] * 10) / 10;
  return o;
}

function pump() {
  const now = performance.now();
  let dt = (now - app.last) / 1000;
  app.last = now;
  if (dt > 0.25) dt = 0.25;
  if (app.game && app.mode !== 'client') {
    app.acc += dt;
    let n = 0;
    while (app.acc >= DT && n < 15) { simTick(); app.acc -= DT; n++; }
    if (n === 15) app.acc = 0;
  }
  if (app.mode === 'client' && app.client && app.locals.length) {
    app.sendTimer -= dt;
    const inp = app.locals[0].ctrl.poll();
    const key = `${inp.mx},${inp.my},${inp.tg},${inp.pu}`;
    if (key !== app.lastSent || app.sendTimer <= 0) {
      app.client.send({ t: 'in', mx: inp.mx, my: inp.my, tg: inp.tg, pu: inp.pu });
      app.lastSent = key;
      app.sendTimer = 0.1;
    }
  }
  return dt;
}

// Läuft auch, wenn der Tab im Hintergrund ist (Host darf nicht einfrieren)
setInterval(() => { if (document.hidden && app.mode === 'host') pump(); }, 50);

function frame() {
  const dt = pump();
  const view = app.mode === 'client' ? clientView() : app.game;
  renderer.draw(view, dt, app.mode === 'demo' ? [] : app.locals.map(l => l.playerId));
  if (view) updateUi(view, dt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- HUD & Phasen
function updateUi(v, dt) {
  if (app.mode === 'demo') return;
  // Screens nach Phase
  if (v.phase !== app.lastPhase) {
    const prev = app.lastPhase;
    app.lastPhase = v.phase;
    if (v.phase === 'lobby') { if (app.mode !== 'local') { show('lobby'); renderLobby(); } }
    else if (v.phase === 'matchEnd') { showEnd(v); }
    else if (app.screen !== 'game') show('game');
    if (v.phase === 'countdown' && prev !== 'countdown') app.hintTimer = Math.max(app.hintTimer, v.round === 1 ? 9 : 0);
  }
  if (app.screen !== 'game' && app.screen !== 'end') return;

  // Punkte
  const myIds = app.locals.map(l => l.playerId);
  const key = v.players.map(p => `${p.id}:${p.wins}:${p.alive}:${p.pol}:${p.name}`).join('|') + v.winsNeeded;
  if (key !== app.hudKey) {
    app.hudKey = key;
    const box = $('#scores');
    box.innerHTML = '';
    for (const p of v.players) {
      const chip = document.createElement('div');
      chip.className = 'chip' + (p.alive || v.phase === 'lobby' ? '' : ' out') + (myIds.includes(p.id) ? ' me' : '');
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.color;
      const pol = document.createElement('span'); pol.className = 'pol ' + (p.pol > 0 ? 'plus' : 'minus'); pol.textContent = p.pol > 0 ? '+' : '−';
      const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = p.name;
      const pips = document.createElement('span'); pips.className = 'pips';
      for (let i = 0; i < Math.min(v.winsNeeded, 10); i++) {
        const pip = document.createElement('span'); pip.className = 'pip' + (i < p.wins ? ' on' : ''); pips.append(pip);
      }
      chip.append(dot, pol, nm, pips);
      box.append(chip);
    }
  }

  // Rundeninfo
  const info = $('#round-info');
  let infoText = `Runde ${v.round}`;
  let danger = false;
  if (v.phase === 'play') {
    const left = CFG.SHRINK_START - v.roundTime;
    if (left > 0) infoText += ` · Ring schrumpft in ${Math.ceil(left)} s`;
    else if (v.ringR > CFG.RING_MIN + 1) { infoText += ' · ⚠ Ring schrumpft!'; danger = true; }
    else infoText += ' · Sudden Death!';
  }
  if (info.textContent !== infoText) info.textContent = infoText;
  info.classList.toggle('danger', danger);

  // Banner
  let banner = '', sub = '';
  if (v.phase === 'countdown') banner = String(Math.max(1, Math.ceil(v.phaseT)));
  else if (v.phase === 'play' && v.roundTime < 0.8) banner = 'LOS!';
  else if (v.phase === 'roundEnd') {
    const w = v.players.find(p => p.id === v.roundWinner);
    banner = w ? `${w.name} gewinnt!` : 'Unentschieden!';
    sub = w ? `Runde ${v.round} · ${w.wins}/${v.winsNeeded} Siege` : 'Alle sind rausgeflogen 🤷';
  }
  if (v.phase === 'countdown' && v.round > 1 && v.phaseT > 2.2) { banner = `Runde ${v.round}`; }
  const bk = banner + '|' + sub;
  const bEl = $('#banner');
  if (bEl.dataset.k !== bk) {
    bEl.dataset.k = bk;
    bEl.innerHTML = '';
    if (banner) {
      bEl.textContent = banner;
      if (sub) { const s = document.createElement('small'); s.textContent = sub; bEl.append(s); }
      bEl.classList.remove('anim'); void bEl.offsetWidth; bEl.classList.add('anim');
    }
  }

  // Steuerungshinweis
  app.hintTimer -= dt;
  const hint = $('#controls-hint');
  if (app.hintTimer > 0 && !useTouch) {
    const txt = app.locals.length > 1
      ? app.locals.map((l, i) => `P${i + 1}: ${l.scheme ? SCHEME_LABELS[l.scheme] : SCHEME_LABELS.pad}`).join('   |   ')
      : SCHEME_LABELS.solo;
    if (hint.textContent !== txt) hint.textContent = txt;
    hint.style.opacity = Math.min(1, app.hintTimer);
  } else hint.style.opacity = 0;

  // Touch-Knöpfe
  if (useTouch && app.locals.length) {
    const me = v.players.find(p => p.id === app.locals[0].playerId);
    if (me) { touch.setPolarity(me.pol); touch.setCooldown(me.pulseCd / CFG.PULSE_CD); }
  }

  // Ping
  const pingEl = $('#ping');
  const pt = app.mode === 'client' && app.client ? `${Math.round(app.client.ping)} ms` : app.mode === 'host' && app.host ? `Raum ${app.host.code || ''}` : '';
  if (pingEl.textContent !== pt) pingEl.textContent = pt;
}

function showEnd(v) {
  const w = v.players.find(p => p.id === v.matchWinner);
  $('#end-title').textContent = w ? `${w.name} gewinnt das Match!` : 'Spielende';
  const t = $('#end-table');
  t.innerHTML = '<tr><th>Spieler</th><th>Siege</th><th>KOs</th></tr>';
  const sorted = [...v.players].sort((a, b) => b.wins - a.wins || b.kos - a.kos);
  for (const p of sorted) {
    const tr = document.createElement('tr');
    if (w && p.id === w.id) tr.className = 'winner';
    const td1 = document.createElement('td');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.color;
    td1.append(dot, document.createTextNode(p.name + (p.bot ? ' 🤖' : '')));
    const td2 = document.createElement('td'); td2.textContent = p.wins;
    const td3 = document.createElement('td'); td3.textContent = p.kos;
    tr.append(td1, td2, td3);
    t.append(tr);
  }
  const isClient = app.mode === 'client';
  $('#btn-end-again').classList.toggle('hidden', isClient);
  $('#btn-end-lobby').classList.toggle('hidden', app.mode !== 'host');
  $('#end-status').textContent = isClient ? 'Warte auf den Host…' : '';
  show('end');
}

// ---------------------------------------------------------------- UI-Verdrahtung
function seg(id, key, onChange) {
  const el = $(id);
  const sync = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(app.settings[key]) === b.dataset.v));
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
    app.settings[key] = v;
    saveSettings(); sync(); sfx.click();
    onChange && onChange(v);
  });
  sync();
}

seg('#seg-humans', 'humans', () => updateLocalCtrlInfo());
seg('#seg-diff-local', 'diff');
seg('#seg-wins-local', 'wins');
seg('#seg-diff-online', 'onlineDiff');
seg('#seg-wins-online', 'wins', v => { if (app.mode === 'host') app.game.winsNeeded = v; });

function syncBots() { $('#local-bots').textContent = app.settings.bots; }
$$('.stepper button').forEach(b => b.addEventListener('click', () => {
  app.settings.bots = Math.max(0, Math.min(7, app.settings.bots + Number(b.dataset.d)));
  saveSettings(); syncBots(); sfx.click();
}));
syncBots();

const nameIn = $('#in-name');
try { nameIn.value = localStorage.getItem('mm-name') || ''; } catch { /* egal */ }
nameIn.addEventListener('input', () => { try { localStorage.setItem('mm-name', nameIn.value.trim()); } catch { /* egal */ } });

document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });

$('#btn-local').onclick = () => { sfx.click(); updateLocalCtrlInfo(); show('local'); };
$$('[data-back]').forEach(b => b.onclick = () => { sfx.click(); show('menu'); });
$('#btn-local-start').onclick = () => { unlockAudio(); startLocal(); };
$('#btn-host').onclick = () => { unlockAudio(); startHost(); };
$('#btn-join').onclick = () => { unlockAudio(); startClient($('#in-code').value); };
$('#in-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-join').click(); });
$('#in-code').addEventListener('input', e => { e.target.value = normalizeCode(e.target.value); });

$('#btn-add-bot').onclick = () => {
  if (app.mode !== 'host' || app.game.players.length >= MAX_PLAYERS) return;
  addBot(app.game, app.settings.onlineDiff);
  sfx.click(); renderLobby();
};
$('#btn-online-start').onclick = () => {
  if (app.mode !== 'host' || app.game.players.length < 2) return;
  app.game.winsNeeded = app.settings.wins;
  startMatch(app.game);
  app.hintTimer = 9;
  show('game');
};
$('#btn-copy').onclick = async () => {
  const code = app.mode === 'host' ? app.host && app.host.code : normalizeCode($('#lobby-code').textContent);
  if (!code) return;
  const url = shareUrl(code);
  try {
    if (navigator.share && useTouch) await navigator.share({ title: 'Magnet Mayhem', text: `Komm in meinen Raum: ${code}`, url });
    else { await navigator.clipboard.writeText(url); toast('🔗 Link kopiert!'); }
  } catch { toast(url); }
};
const leave = () => {
  sfx.click();
  history.replaceState(null, '', location.pathname + (new URLSearchParams(location.search).get('peer') ? `?peer=${new URLSearchParams(location.search).get('peer')}` : ''));
  startDemo();
};
$('#btn-lobby-leave').onclick = leave;
$('#btn-end-menu').onclick = leave;
$('#btn-leave').onclick = () => {
  if (app.mode === 'host' && app.host && app.host.count > 0 && !confirm('Wenn du gehst, endet das Spiel für alle. Wirklich verlassen?')) return;
  leave();
};
$('#btn-end-again').onclick = () => {
  if (app.mode === 'client') return;
  sfx.click();
  startMatch(app.game);
  show('game');
};
$('#btn-end-lobby').onclick = () => {
  if (app.mode !== 'host') return;
  app.game.phase = 'lobby';
  app.game.objects = [];
  for (const p of app.game.players) { p.alive = false; p.fallT = 99; }
  app.game.metaVer++;
  show('lobby'); renderLobby();
};

const muteBtn = $('#btn-mute');
const syncMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
muteBtn.onclick = () => { setMuted(!isMuted()); syncMute(); };
syncMute();
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyM') { setMuted(!isMuted()); syncMute(); }
  if (e.code === 'Escape' && app.screen === 'local') show('menu');
});
window.addEventListener('gamepadconnected', e => { toast(`🎮 Gamepad ${e.gamepad.index + 1} verbunden`); updateLocalCtrlInfo(); });
window.addEventListener('beforeunload', () => { if (app.host) app.host.close(); });

// ---------------------------------------------------------------- Start
startDemo();
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  $('#in-code').value = normalizeCode(roomParam);
  toast(`Raum ${normalizeCode(roomParam)} – gib deinen Namen ein und tippe auf „Beitreten“.`);
}
requestAnimationFrame(frame);

// Für Tests/Debugging
window.__mm = app;
