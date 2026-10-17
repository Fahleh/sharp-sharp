import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEDS } from '../js/config.js';
import { generateCity } from '../js/city.js';
import { MAP, graph } from '../js/map.js';
import { createPedestrians } from '../js/pedestrians.js';
import { createRng } from '../js/rng.js';
import { createTerrain } from '../js/terrain.js';

const terrain = createTerrain();
const city = generateCity({ terrain });
const DT = 1 / 60;
const make = (seed) => createPedestrians({ graph, index: city.index, rng: createRng(seed), crossings: city.crossings });
const around = { x: 100, z: 20, speed: 0 };
const ctx = (player = around, progress = 0, vehicles = [], view = { fx: 1, fz: 0 }) => ({ player, view, progress, vehicles });

function run(peds, seconds, player = around, progress = 0, vehicles = []) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) events.push(...peds.step(DT, ctx(player, progress, vehicles)));
  return events;
}

test('people appear around the player and never exceed the cap', () => {
  const peds = make(1);
  peds.reset({ player: around, view: { fx: 1, fz: 0 } });
  assert.ok(peds.peds.length >= PEDS.startPeds - 2);
  for (let i = 0; i < 60 * 60; i += 1) {
    peds.step(DT, ctx(around, i / 3600));
    assert.ok(peds.peds.length <= PEDS.maxPeds);
  }
});

test('the market street has a standing crowd once you are near, and it stays in the market', () => {
  const away = { x: 150, z: 150, speed: 0 };
  const market = { x: -75, z: 25, speed: 0 };
  const crowdAt = (player) => {
    const peds = make(2);
    peds.reset({ player, view: { fx: 1, fz: 0 } });
    run(peds, 40, player, 0.5);
    return peds.peds.filter((p) => p.keep);
  };
  const crowd = crowdAt(market);
  assert.equal(crowd.length, PEDS.marketCrowd);
  assert.equal(crowdAt(away).length, 0);
  for (const p of crowd) assert.equal(p.edge.kind, 'market');
  // Even in sight: that is the point of a crowd that was there before you arrived.
  assert.ok(crowd.some((p) => Math.hypot(p.x - market.x, p.z - market.z) < 40));
});

test('the crowd arrives as the player comes close, and the cap still holds', () => {
  const peds = make(3);
  const player = { x: 150, z: 150, speed: 0 };
  peds.reset({ player, view: { fx: 1, fz: 0 } });
  assert.equal(peds.peds.filter((p) => p.keep).length, 0);
  player.x = -75;
  player.z = 25;
  run(peds, 1, player, 1);
  assert.equal(peds.peds.filter((p) => p.keep).length, PEDS.marketCrowd);
  run(peds, 60, player, 1);
  assert.ok(peds.peds.length <= PEDS.maxPeds);
  // Going away again clears it.
  const gone = { x: 200, z: 190, speed: 0 };
  run(peds, 2, gone, 1);
  assert.equal(peds.peds.filter((p) => p.keep).length, 0);
});

test('new people appear at a distance and outside the view when close', () => {
  for (let seed = 1; seed <= 8; seed += 1) {
    const peds = make(seed);
    const view = { fx: 0, fz: 1 };
    peds.reset({ player: around, view });
    const known = new Set(peds.peds.map((p) => p.id));
    for (let i = 0; i < 60 * 40; i += 1) {
      peds.step(DT, ctx(around, 0.5, [], view));
      for (const p of peds.peds) {
        if (known.has(p.id)) continue;
        known.add(p.id);
        const d = Math.hypot(p.x - around.x, p.z - around.z);
        assert.ok(d >= PEDS.spawnMin - 4 && d <= PEDS.spawnMax + 4, `distance ${d}`);
        if (d < PEDS.hiddenMin - 4) {
          const cos = ((p.x - around.x) * view.fx + (p.z - around.z) * view.fz) / d;
          assert.ok(cos <= Math.cos(PEDS.viewHalfAngle) + 0.05, 'appeared inside the view');
        }
      }
    }
  }
});

test('walkers keep to the pavement, and only cross the road on a crossing', () => {
  const peds = make(3);
  const player = { x: -60, z: 10, speed: 0 };
  peds.reset({ player, view: { fx: 1, fz: 0 } });
  let crossed = 0;
  const wasCrossing = new Set();
  for (let i = 0; i < 60 * 240; i += 1) {
    peds.step(DT, ctx(player, 0.5));
    for (const p of peds.peds) {
      if (p.edge.kind === 'market' || p.link) continue;
      const reach = Math.abs(p.lateral) - p.edge.hw;
      if (p.state === 'cross') {
        if (!wasCrossing.has(p.id)) {
          wasCrossing.add(p.id);
          crossed += 1;
          const marked = city.crossings.some((c) => c.a === p.edge.a && c.b === p.edge.b && Math.abs(c.s - p.s) < 0.01);
          assert.ok(marked, `${p.id} crossed away from a crossing on ${p.key}`);
        }
        continue;
      }
      wasCrossing.delete(p.id);
      assert.ok(reach >= PEDS.lateralMin - 1e-6 && reach <= PEDS.lateralMax + PEDS.startleStep + 1e-6, `${p.id} walking ${reach} m from the kerb`);
    }
  }
  assert.ok(crossed > 3, 'some people used the crossings');
});

test('people never stand in the road at a corner: walkers stay out of the crossing road', () => {
  const peds = make(4);
  const player = { x: -115, z: -15, speed: 0 };
  peds.reset({ player, view: { fx: 1, fz: 0 } });
  let walkingOnRoad = 0;
  let total = 0;
  for (let i = 0; i < 60 * 120; i += 1) {
    peds.step(DT, ctx(player, 0.5));
    for (const p of peds.peds) {
      if (p.state !== 'walk' || p.link || p.edge.kind === 'market') continue;
      total += 1;
      if (terrain.surfaceAt(p.x, p.z) === 'road') walkingOnRoad += 1;
    }
  }
  assert.ok(total > 500);
  assert.ok(walkingOnRoad / total < 0.01, `${walkingOnRoad} of ${total} on the road`);
});

test('someone at the kerb waits for a fast bike, and goes when it has passed', () => {
  const near = { x: -115, z: -15, speed: 0 };
  const sim = make(6);
  sim.reset({ player: near, view: { fx: 1, fz: 0 } });
  let waiting = null;
  for (let i = 0; i < 60 * 600 && !waiting; i += 1) {
    sim.step(DT, ctx(near, 0.5));
    waiting = sim.peds.find((p) => p.state === 'wait') ?? null;
  }
  assert.ok(waiting, 'someone waited at a crossing');
  // A fast bike close by keeps them there.
  const fast = { x: waiting.x + 8, z: waiting.z, speed: 10 };
  for (let i = 0; i < 60 * 3; i += 1) sim.step(DT, ctx(fast, 0.5));
  assert.equal(waiting.state, 'wait');
  // Once it is gone they cross.
  for (let i = 0; i < 60 * 3; i += 1) sim.step(DT, ctx({ x: 9999, z: 9999, speed: 0 }, 0.5));
  assert.notEqual(waiting.state, 'wait');
});

test('a person who is hit falls, then gets up and walks on; a second hit while down is ignored', () => {
  const peds = make(7);
  peds.reset({ player: around, view: { fx: 1, fz: 0 } });
  const p = peds.peds[0];
  assert.equal(peds.hit(p.id), true);
  assert.equal(p.state, 'stumble');
  assert.equal(peds.hit(p.id), false);
  assert.equal(peds.shapes().find((s) => s.id === p.id).down, true);
  run(peds, PEDS.stumbleSeconds + 0.2);
  assert.equal(p.state === 'stumble', false);
  assert.equal(peds.hit('nobody'), false);
});

test('a fast pass close by startles someone, who steps back from the road', () => {
  const peds = make(8);
  peds.reset({ player: around, view: { fx: 1, fz: 0 } });
  const p = peds.peds.find((o) => o.edge.kind !== 'market');
  const before = Math.abs(p.lateral);
  const rider = { x: p.x + 1, z: p.z, speed: PEDS.startleSpeed + 2 };
  const events = peds.step(DT, ctx(rider));
  assert.ok(events.some((e) => e.type === 'pedStartled' && e.id === p.id));
  run(peds, 0.5, { x: 9999, z: 9999, speed: 0 });
  assert.ok(Math.abs(p.lateral) > before);
  // Slow riders do not startle anyone.
  const calm = make(8);
  calm.reset({ player: around, view: { fx: 1, fz: 0 } });
  const q = calm.peds[0];
  assert.deepEqual(calm.step(DT, ctx({ x: q.x + 1, z: q.z, speed: 2 })).filter((e) => e.type === 'pedStartled'), []);
});

test('a horn startles everyone close, and nobody far away', () => {
  const peds = make(9);
  peds.reset({ player: around, view: { fx: 1, fz: 0 } });
  const [first] = peds.peds;
  const events = peds.startleAround({ x: first.x, z: first.z }, 6);
  assert.ok(events.some((e) => e.id === first.id));
  for (const e of events) {
    const p = peds.peds.find((o) => o.id === e.id);
    assert.ok(Math.hypot(p.x - first.x, p.z - first.z) < 6.5);
  }
});

test('only people on a crossing or in the market are obstacles for vehicles', () => {
  const peds = make(10);
  peds.reset({ player: { x: -75, z: 25, speed: 0 }, view: { fx: 1, fz: 0 } });
  run(peds, 20, { x: -75, z: 25, speed: 0 }, 0.5);
  const expected = peds.peds.filter((p) => p.state === 'cross' || p.edge.kind === 'market').length;
  assert.equal(peds.obstacles().length, expected);
  for (const o of peds.obstacles()) assert.ok(o.hw > 0 && o.hd > 0);
});

test('pedestrians are deterministic for a seed, and shapes are round bodies', () => {
  const trace = (seed) => {
    const peds = make(seed);
    peds.reset({ player: around, view: { fx: 1, fz: 0 } });
    run(peds, 20);
    return peds.peds.map((p) => [p.id, +p.x.toFixed(3), +p.z.toFixed(3)]);
  };
  assert.deepEqual(trace(11), trace(11));
  assert.notDeepEqual(trace(11), trace(12));
  const peds = make(13);
  peds.reset({ player: around, view: { fx: 1, fz: 0 } });
  for (const s of peds.shapes()) {
    assert.equal(s.shape.type, 'circle');
    assert.equal(s.kind, 'pedestrian');
  }
  assert.ok(MAP.world.wallX > 0);
});

test('people far away leave', () => {
  const peds = make(14);
  peds.reset({ player: around, view: { fx: 1, fz: 0 } });
  peds.step(DT, ctx({ x: 5000, z: 5000, speed: 0 }));
  assert.equal(peds.peds.length, 0);
});
