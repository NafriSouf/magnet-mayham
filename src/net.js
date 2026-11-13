// Online-Multiplayer über WebRTC (PeerJS). Ein Spieler ist Host und simuliert,
// die anderen senden nur Eingaben und bekommen ~30 Snapshots pro Sekunde.
/* global Peer */

const PREFIX = 'magnet-mayhem-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function peerOptions() {
  // Für lokale Tests kann ein eigener PeerJS-Server angegeben werden: ?peer=localhost:9000
  const q = new URLSearchParams(location.search).get('peer');
  const opts = { debug: 0 };
  if (q) {
    const [host, port] = q.split(':');
    Object.assign(opts, { host, port: Number(port) || 9000, path: '/', secure: location.protocol === 'https:' && host !== 'localhost' });
  }
  return opts;
}

export function randomCode(len = 4) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function normalizeCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') { reject(new Error('PeerJS konnte nicht geladen werden.')); return; }
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('Der Vermittlungsserver antwortet nicht. Prüfe deine Internetverbindung.')); }, 12000);
    peer.once('open', () => { clearTimeout(timer); resolve(peer); });
    peer.once('error', err => { clearTimeout(timer); peer.destroy(); reject(err); });
  });
}

// ------------------------------------------------------------------ Host

export class HostNet {
  constructor() {
    this.peer = null;
    this.code = null;
    this.clients = new Map(); // peerId -> { conn, playerId, name }
    this.onJoin = null;   // (peerId, name) => playerId | null
    this.onLeave = null;  // (playerId)
    this.onInput = null;  // (playerId, input)
  }

  async start() {
    for (let tries = 0; tries < 5; tries++) {
      const code = randomCode();
      try {
        this.peer = await openPeer(PREFIX + code);
        this.code = code;
        break;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue;
        throw friendlyError(e);
      }
    }
    if (!this.peer) throw new Error('Konnte keinen Raum erstellen. Versuch es nochmal.');
    this.peer.on('connection', conn => this.accept(conn));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch { /* egal */ } });
    return this.code;
  }

  accept(conn) {
    conn.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      const c = this.clients.get(conn.peer);
      if (msg.t === 'hello' && !c) {
        const name = String(msg.name || 'Gast').slice(0, 16);
        const res = this.onJoin ? this.onJoin(conn.peer, name) : null;
        if (res == null || res.error) {
          conn.send({ t: 'reject', reason: (res && res.error) || 'Der Raum ist voll.' });
          setTimeout(() => conn.close(), 300);
          return;
        }
        this.clients.set(conn.peer, { conn, playerId: res, name });
        conn.send({ t: 'welcome', id: res, code: this.code });
      } else if (msg.t === 'in' && c) {
        this.onInput && this.onInput(c.playerId, msg);
      } else if (msg.t === 'ping') {
        conn.send({ t: 'pong', c: msg.c });
      }
    });
    const drop = () => {
      const c = this.clients.get(conn.peer);
      if (c && c.conn === conn) {
        this.clients.delete(conn.peer);
        this.onLeave && this.onLeave(c.playerId);
      }
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  broadcast(msg) {
    for (const c of this.clients.values()) {
      if (c.conn.open) { try { c.conn.send(msg); } catch { /* egal */ } }
    }
  }

  kick(playerId) {
    for (const [pid, c] of this.clients) {
      if (c.playerId === playerId) {
        try { c.conn.send({ t: 'reject', reason: 'Du wurdest vom Host entfernt.' }); } catch { /* egal */ }
        setTimeout(() => c.conn.close(), 200);
        this.clients.delete(pid);
      }
    }
  }

  get count() { return this.clients.size; }

  close() {
    this.broadcast({ t: 'bye' });
    setTimeout(() => { try { this.peer && this.peer.destroy(); } catch { /* egal */ } }, 150);
  }
}

// ------------------------------------------------------------------ Client

export class ClientNet {
  constructor() {
    this.peer = null; this.conn = null;
    this.playerId = null;
    this.onMessage = null; // (msg)
    this.onClose = null;   // (reason)
    this.ping = 0;
    this.closed = false;
  }

  async join(code, name) {
    this.peer = await openPeer(null).catch(e => { throw friendlyError(e); });
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      this.conn = conn;
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; reject(new Error(`Raum ${code} nicht gefunden oder nicht erreichbar.`)); this.close(); }
      }, 15000);
      this.peer.on('error', e => {
        if (!done) { done = true; clearTimeout(timer); reject(friendlyError(e, code)); this.close(); }
        else this.fail('Verbindungsfehler: ' + (e.type || e.message));
      });
      conn.on('open', () => conn.send({ t: 'hello', name }));
      conn.on('data', msg => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'welcome' && !done) {
          done = true; clearTimeout(timer);
          this.playerId = msg.id;
          this.startPing();
          resolve(msg.id);
          return;
        }
        if (msg.t === 'reject') {
          if (!done) { done = true; clearTimeout(timer); reject(new Error(msg.reason)); this.close(); }
          else this.fail(msg.reason);
          return;
        }
        if (msg.t === 'bye') { this.fail('Der Host hat das Spiel beendet.'); return; }
        if (msg.t === 'pong') { this.ping = performance.now() - msg.c; return; }
        this.onMessage && this.onMessage(msg);
      });
      conn.on('close', () => {
        if (!done) { done = true; clearTimeout(timer); reject(new Error('Verbindung abgelehnt.')); }
        else this.fail('Verbindung zum Host verloren.');
      });
    });
  }

  startPing() {
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }

  send(msg) {
    if (this.conn && this.conn.open) { try { this.conn.send(msg); } catch { /* egal */ } }
  }

  fail(reason) {
    if (this.closed) return;
    this.close();
    this.onClose && this.onClose(reason);
  }

  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    try { this.conn && this.conn.close(); } catch { /* egal */ }
    try { this.peer && this.peer.destroy(); } catch { /* egal */ }
  }
}

function friendlyError(e, code) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return new Error(`Raum ${code || ''} existiert nicht (mehr).`);
  if (t === 'browser-incompatible') return new Error('Dein Browser unterstützt kein WebRTC.');
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
    return new Error('Keine Verbindung zum Vermittlungsserver. Prüfe dein Internet.');
  return e instanceof Error ? e : new Error(String(e && (e.message || e.type) || e));
}
