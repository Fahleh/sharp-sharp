import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKE, HAZARDS } from '../js/config.js';
import { bikeCircles } from '../js/collide.js';
import { createRng } from '../js/rng.js';
import { createGraph } from '../js/route.js';
import { createHazardTracker, generateHazards, hazardEffect } from '../js/hazards.js';
import { MAP, SPAWN } from '../js/map.js';

const make = (seed, graph = MAP.graph) => generateHazards({ graph, rng: createRng(seed), keepClear: [SPAWN] });

test('the same seed places the same hazards, and another seed places different ones', () => {
  assert.deepEqual(make(3), make(3));
  assert.notDeepEqual(make(3), make(4));
});

test('a city has some potholes and some bumps', () => {
  const h = make(1);
  assert.ok(h.potholes.length >= 5, `potholes ${h.potholes.length}`);
  assert.ok(h.bumps.length >= 2, `bumps ${h.bumps.length}`);
});

test('no hazard is near the spawn, near another one, or on a bridge, ring or market road', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const h = make(seed);
    const all = [...h.potholes, ...h.bumps];
    for (const a of all) {
      assert.ok(Math.hypot(a.x - SPAWN.x, a.z - SPAWN.z) >= HAZARDS.spawnClear, `seed ${seed} near spawn`);
      for (const b of all) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= HAZARDS.spacing - 1e-6, `seed ${seed} crowded`);
    }
    const forbidden = MAP.graph.edges.filter((e) => !HAZARDS.roadKinds.includes(e.kind));
    for (const edge of forbidden) {
      const a = MAP.graph.nodes.get(edge.a);
      const b = MAP.graph.nodes.get(edge.b);
      for (const item of all) {
        const t = ((item.x - a.x) * (b.x - a.x) + (item.z - a.z) * (b.z - a.z)) / edge.length ** 2;
        const off = Math.hypot(a.x + (b.x - a.x) * t - item.x, a.z + (b.z - a.z) * t - item.z);
        assert.ok(t < 0 || t > 1 || off > edge.hw + 1, `seed ${seed} on a ${edge.kind} road`);
      }
    }
  }
});

test('potholes sit inside the road, bumps span it', () => {
  const h = make(2);
  for (const bump of h.bumps) {
    assert.ok(bump.hw >= 4, 'a bump covers the road width');
    assert.equal(bump.hd, HAZARDS.bump.halfDepth);
  }
  assert.ok(h.potholes.every((p) => p.r === HAZARDS.pothole.r));
});

test('a graph with no suitable road gets no hazards', () => {
  const graph = createGraph({ nodes: [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 0, z: 100 }], edges: [{ a: 'a', b: 'b' }] });
  assert.deepEqual(make(1, graph), { potholes: [], bumps: [] });
});

const onPothole = { potholes: [{ id: 'p1', type: 'circle', x: 0, z: 0, r: 0.8 }], bumps: [] };
const bikeAt = (z) => bikeCircles({ x: 0, z, heading: 0 }, BIKE);

test('rolling onto a pothole hits once, not every frame, until the retrigger time passes', () => {
  const tracker = createHazardTracker();
  const hits = (time, z = 0) => tracker.update({ time, circles: bikeAt(z), hazards: onPothole }).length;
  assert.equal(hits(0), 1);
  assert.equal(hits(0.1), 0);
  assert.equal(hits(1), 0);
  assert.equal(hits(HAZARDS.retriggerSeconds + 0.1), 1);
});

test('missing a hazard by a lane is no hit', () => {
  const tracker = createHazardTracker();
  assert.equal(tracker.update({ time: 0, circles: bikeAt(10), hazards: onPothole }).length, 0);
});

test('a bump is hit by the bike crossing it', () => {
  const tracker = createHazardTracker();
  const bumps = { potholes: [], bumps: [{ id: 'b1', type: 'box', x: 0, z: 0, hw: 5, hd: 0.4, angle: 0 }] };
  const hits = tracker.update({ time: 0, circles: bikeAt(0.2), hazards: bumps });
  assert.deepEqual(hits.map((h) => h.kind), ['bump']);
});

test('reset forgets earlier hits', () => {
  const tracker = createHazardTracker();
  tracker.update({ time: 0, circles: bikeAt(0), hazards: onPothole });
  tracker.reset();
  assert.equal(tracker.update({ time: 0.1, circles: bikeAt(0), hazards: onPothole }).length, 1);
});

test('a pothole always slows and shakes; a faster hit is worse', () => {
  const slow = hazardEffect('pothole', 3);
  const fast = hazardEffect('pothole', BIKE.topSpeed);
  assert.ok(slow.speedFactor < 1 && slow.conditionLoss > 0);
  assert.ok(fast.speedFactor < slow.speedFactor);
  assert.ok(fast.conditionLoss > slow.conditionLoss);
  assert.ok(fast.joltSize > slow.joltSize);
});

test('a bump taken gently costs nothing; at speed it costs less than a pothole', () => {
  const gentle = hazardEffect('bump', HAZARDS.bump.gentleSpeed - 0.5);
  assert.deepEqual(gentle, { speedFactor: 1, conditionLoss: 0, joltSeconds: 0, joltSize: 0 });
  const bump = hazardEffect('bump', BIKE.topSpeed);
  const pothole = hazardEffect('pothole', BIKE.topSpeed);
  assert.ok(bump.speedFactor < 1);
  assert.ok(bump.conditionLoss < pothole.conditionLoss);
  assert.ok(bump.speedFactor > pothole.speedFactor);
});
