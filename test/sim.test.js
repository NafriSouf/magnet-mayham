import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, startMatch, step, snapshot, meta, viewFromSnapshot, setInput, CFG } from '../src/game.js';
import { botThink } from '../src/bot.js';

function runMatch(n, seed, difficulty = 'normal') {
  const s = createGame({ winsNeeded: 3, seed });
  for (let i = 0; i < n; i++) addPlayer(s, { id: i + 1, name: 'Bot' + i, bot: true, difficulty });
  startMatch(s);
  const dt = 1 / 60;
  let steps = 0, events = {};
  while (s.phase !== 'matchEnd' && steps < 60 * 60 * 15) {
    for (const p of s.players) botThink(s, p, dt);
    for (const e of step(s, dt)) events[e.t] = (events[e.t] || 0) + 1;
    steps++;
    for (const p of s.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'NaN position');
  }
  return { s, steps, events };
}

test('Bot-Matches enden mit einem Sieger', () => {
  for (const n of [2, 4, 8]) {
    for (let seed = 1; seed <= 4; seed++) {
      const { s, steps, events } = runMatch(n, seed);
      assert.equal(s.phase, 'matchEnd', `n=${n} seed=${seed} endete nicht`);
      const w = s.players.find(p => p.id === s.matchWinner);
      assert.ok(w && w.wins === 3);
      const avgRound = steps / 60 / s.round;
      console.log(`n=${n} seed=${seed}: ${s.round} Runden, Ø ${avgRound.toFixed(1)}s/Runde`, JSON.stringify(events));
    }
  }
});

test('Gleiche Pole stoßen sich ab, ungleiche ziehen sich an', () => {
  for (const [pa, pb, expectApart] of [[1, 1, true], [1, -1, false]]) {
    const s = createGame({ seed: 1 });
    const a = addPlayer(s, { id: 1, name: 'A' }), b = addPlayer(s, { id: 2, name: 'B' });
    startMatch(s); s.phase = 'play'; s.objects = [];
    a.x = -60; a.y = 0; b.x = 60; b.y = 0; a.pol = pa; b.pol = pb;
    for (let i = 0; i < 20; i++) step(s, 1 / 60);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    assert.equal(d > 120, expectApart, `pol ${pa}/${pb}: d=${d}`);
  }
});

test('Puls schleudert gleichpoligen Gegner aus dem Ring', () => {
  const s = createGame({ seed: 1 });
  const a = addPlayer(s, { id: 1, name: 'A' }), b = addPlayer(s, { id: 2, name: 'B' });
  startMatch(s); s.phase = 'play'; s.objects = [];
  a.x = 230; a.y = 0; b.x = 330; b.y = 0; a.pol = b.pol = 1;
  setInput(s, 1, { mx: 0, my: 0, tg: a.input.tg, pu: a.input.pu + 1 });
  for (let i = 0; i < 120 && s.phase === 'play'; i++) step(s, 1 / 60);
  assert.equal(b.alive, false);
  assert.equal(a.alive, true);
  assert.equal(a.kos, 1);
  assert.equal(a.wins, 1);
});

test('Snapshot -> View Roundtrip', () => {
  const { s } = runMatch(3, 7);
  const v = viewFromSnapshot(JSON.parse(JSON.stringify(snapshot(s))), meta(s));
  assert.equal(v.players.length, 3);
  assert.equal(v.matchWinner, s.matchWinner);
  assert.equal(v.players[0].name, s.players[0].name);
  assert.ok(JSON.stringify(snapshot(s)).length < 4000);
});

test('Ungültige Eingaben werden abgefangen', () => {
  const s = createGame({ seed: 1 });
  addPlayer(s, { id: 1, name: 'A' });
  setInput(s, 1, { mx: 'x', my: 1e9, tg: NaN, pu: null });
  assert.equal(s.players[0].input.mx, 0);
  assert.equal(s.players[0].input.my, 1);
});
