import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUEST_STYLE, SCORE_LIMITS, STYLE_OPTIONS } from '../js/config.js';
import {
  buildScorePayload, cleanText, normalizeLeaderboard, normalizePlayer, normalizeScoreReply, normalizeStyle,
  parseBest, playerKey, sanitizeFace, shouldSaveScore,
} from '../js/validate.js';

const full = {
  body: 'female', primaryColor: '#A55EEA', secondaryColor: '#0c6e5a', skinColor: '#8d5524',
  hairColor: '#17120f', hair: 'braids', hat: 'crown', accessory: 'earrings',
};

test('style: a documented style passes through, colours lower-cased', () => {
  assert.deepEqual(normalizeStyle(full), { ...full, primaryColor: '#a55eea' });
});

test('style: every documented value is accepted', () => {
  for (const key of ['body', 'hair', 'hat', 'accessory']) {
    for (const value of STYLE_OPTIONS[key]) assert.equal(normalizeStyle({ [key]: value })[key], value);
  }
});

test('style: missing, unknown and badly typed fields fall back to the guest look per field', () => {
  assert.deepEqual(normalizeStyle(undefined), { ...GUEST_STYLE });
  assert.deepEqual(normalizeStyle(null), { ...GUEST_STYLE });
  assert.deepEqual(normalizeStyle('x'), { ...GUEST_STYLE });
  assert.deepEqual(normalizeStyle([]), { ...GUEST_STYLE });
  const mixed = normalizeStyle({ ...full, hair: 'mohawk', hat: 7, primaryColor: 'red', secondaryColor: '#12345', skinColor: '#12345g', body: 'robot' });
  assert.equal(mixed.hair, GUEST_STYLE.hair);
  assert.equal(mixed.hat, GUEST_STYLE.hat);
  assert.equal(mixed.primaryColor, GUEST_STYLE.primaryColor);
  assert.equal(mixed.secondaryColor, GUEST_STYLE.secondaryColor);
  assert.equal(mixed.skinColor, GUEST_STYLE.skinColor);
  assert.equal(mixed.body, GUEST_STYLE.body);
  assert.equal(mixed.accessory, 'earrings', 'valid fields survive their invalid neighbours');
});

test('style: prototype tricks do not leak', () => {
  const style = normalizeStyle({ __proto__: { hair: 'afro' }, constructor: 'x' });
  assert.equal(style.hair, GUEST_STYLE.hair);
});

test('face: only PNG data URLs', () => {
  assert.equal(sanitizeFace('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(sanitizeFace('https://evil.example/x.png'), null);
  assert.equal(sanitizeFace('data:image/svg+xml;base64,AAAA'), null);
  assert.equal(sanitizeFace('javascript:alert(1)'), null);
  assert.equal(sanitizeFace(42), null);
  assert.equal(sanitizeFace(undefined), null);
});

test('cleanText: strips control and zero-width characters, collapses space, caps length', () => {
  assert.equal(cleanText('  Runner ​ Tee\u0007 ', 'x'), 'Runner Tee');
  assert.equal(cleanText('<b>hi</b>', 'x'), '<b>hi</b>', 'markup is kept as text: rendering uses textContent');
  assert.equal(cleanText('', 'fallback'), 'fallback');
  assert.equal(cleanText('​​', 'fallback'), 'fallback');
  assert.equal(cleanText(5, null), null);
  assert.equal(cleanText('a'.repeat(100), 'x').length, 40);
});

test('player: signed-in reply', () => {
  const player = normalizePlayer({
    user: { id: 42, name: 'Runner Tee', account: 'Hamzat', style: full, face: 'data:image/png;base64,AAAA' },
    guest: { name: 'Guest', style: GUEST_STYLE, face: 'data:image/png;base64,BBBB' },
  });
  assert.equal(player.id, 42);
  assert.equal(player.signedIn, true);
  assert.equal(player.name, 'Runner Tee');
  assert.equal(player.account, 'Hamzat');
  assert.equal(player.face, 'data:image/png;base64,AAAA');
  assert.equal(player.style.hair, 'braids');
});

test('player: guest reply and nonsense', () => {
  const guest = normalizePlayer({ user: null, guest: { name: 'Guest', style: GUEST_STYLE, face: 'data:image/png;base64,BBBB' } });
  assert.equal(guest.signedIn, false);
  assert.equal(guest.id, null);
  assert.equal(guest.account, null);
  assert.equal(guest.name, 'Guest');
  for (const bad of [null, undefined, 3, 'x', [], {}, { user: null }]) assert.equal(normalizePlayer(bad), null);
});

test('player: a user without a usable id is treated as a guest', () => {
  for (const id of [0, -1, 1.5, '7', null, Number.NaN]) {
    const player = normalizePlayer({ user: { id, name: 'X' }, guest: { name: 'Guest' } });
    assert.equal(player.signedIn, false);
    assert.equal(player.name, 'Guest');
  }
});

test('playerKey changes when the player or look changes', () => {
  const a = normalizePlayer({ user: { id: 1, name: 'A', style: full } });
  const b = normalizePlayer({ user: { id: 1, name: 'A', style: { ...full, hair: 'bun' } } });
  assert.equal(playerKey(a), playerKey(normalizePlayer({ user: { id: 1, name: 'A', style: full } })));
  assert.notEqual(playerKey(a), playerKey(b));
  assert.equal(playerKey(null), '');
});

test('score payload: whole numbers with the documented keys', () => {
  assert.deepEqual(buildScorePayload({ earnings: 4350, deliveries: 4 }), { ok: true, stats: { earnings: 4350, deliveries: 4 } });
  assert.deepEqual(Object.keys(buildScorePayload({ earnings: 1, deliveries: 1 }).stats), ['earnings', 'deliveries']);
});

test('score payload: range edges and rejects', () => {
  assert.equal(buildScorePayload({ earnings: 0, deliveries: 0 }).ok, true);
  assert.equal(buildScorePayload({ earnings: SCORE_LIMITS.max, deliveries: 1 }).ok, true);
  for (const bad of [SCORE_LIMITS.max + 1, -1, 1.5, Number.NaN, Infinity, '5', null, undefined]) {
    assert.equal(buildScorePayload({ earnings: bad, deliveries: 1 }).ok, false, `earnings ${String(bad)}`);
    assert.equal(buildScorePayload({ earnings: 1, deliveries: bad }).ok, false, `deliveries ${String(bad)}`);
  }
});

test('score is saved only when signed in with at least one delivery', () => {
  assert.equal(shouldSaveScore({ signedIn: true, deliveries: 1 }), true);
  assert.equal(shouldSaveScore({ signedIn: true, deliveries: 0 }), false);
  assert.equal(shouldSaveScore({ signedIn: false, deliveries: 5 }), false);
});

test('score reply: improved and rank, and every kind of bad reply', () => {
  assert.deepEqual(normalizeScoreReply({ ok: true, result: { best: 9, improved: true, rank: 3 } }), { ok: true, improved: true, rank: 3 });
  assert.deepEqual(normalizeScoreReply({ ok: true, result: { improved: 'yes', rank: -2 } }), { ok: true, improved: false, rank: null });
  assert.deepEqual(normalizeScoreReply({ ok: true }), { ok: true, improved: false, rank: null });
  assert.equal(normalizeScoreReply({ ok: false, error: 'Sign in to save your score' }).ok, false);
  for (const bad of [null, undefined, 'ok', 4, []]) assert.equal(normalizeScoreReply(bad).ok, false);
});

test('leaderboard: entries are validated, capped and cleaned', () => {
  const entries = [
    { rank: 1, player_id: 7, name: 'Trini', color: '#4b7bec', score: 8, stats: { earnings: 9100, deliveries: 8 } },
    { rank: 2, player_id: 'x', name: '​', stats: { earnings: -5, deliveries: 'many' } },
    { rank: 0, name: 'bad rank' },
    'junk',
    null,
  ];
  const board = normalizeLeaderboard({ ok: true, entries });
  assert.equal(board.ok, true);
  assert.equal(board.entries.length, 2);
  assert.deepEqual(board.entries[0], { rank: 1, playerId: 7, name: 'Trini', earnings: 9100, deliveries: 8 });
  assert.deepEqual(board.entries[1], { rank: 2, playerId: null, name: 'Player', earnings: 0, deliveries: 0 });
  assert.equal(normalizeLeaderboard({ ok: true, entries: Array.from({ length: 30 }, (_, i) => ({ rank: i + 1 })) }).entries.length, 10);
  for (const bad of [null, {}, { ok: false }, { ok: true }, { ok: true, entries: 'x' }]) assert.equal(normalizeLeaderboard(bad).ok, false);
});

test('parseBest: only plain non-negative whole numbers in range', () => {
  assert.equal(parseBest('4350'), 4350);
  assert.equal(parseBest('0'), 0);
  for (const bad of [null, undefined, '', '-5', '1.5', 'abc', '1e9', '99999999999', '12 ', 5, {}]) assert.equal(parseBest(bad), 0, String(bad));
  assert.equal(parseBest('1000000001'), 0);
});
