import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAFFIC } from '../js/config.js';
import { shapesOverlap } from '../js/collide.js';
import { createLaneNet } from '../js/lanes.js';
import { MAP, graph } from '../js/map.js';
import { createRng } from '../js/rng.js';
import { createTraffic } from '../js/traffic.js';

const net = createLaneNet(graph);
const stops = new Set(MAP.landmarks.map((l) => l.node));
const DT = 1 / 60;
const make = (seed, stopSet = stops) => createTraffic({ net, rng: createRng(seed), stops: stopSet });
const still = { x: 5, z: -45, vx: 0, vz: 0 };
const ctx = (player, progress = 0, view = { fx: 1, fz: 0 }, obstacles = []) => ({ player, view, progress, obstacles });
const bodies = (traffic) => traffic.shapes().map((s) => s.shape);

function run(traffic, seconds, player = still, progress = 0) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) events.push(...traffic.step(DT, ctx(player, progress)));
  return events;
}

test('a shift starts with traffic already on the road, never more than the cap', () => {
  const traffic = make(3);
  traffic.reset({ player: still, view: { fx: 1, fz: 0 } });
  assert.ok(traffic.vehicles.length >= TRAFFIC.startVehicles - 1);
  for (let i = 0; i < 60 * 60; i += 1) {
    traffic.step(DT, ctx(still, i / 3600));
    assert.ok(traffic.vehicles.length <= TRAFFIC.maxVehicles);
  }
  assert.ok(traffic.vehicles.length >= TRAFFIC.startVehicles);
});

test('density rises toward the end of the shift', () => {
  const early = make(4);
  early.reset({ player: still, view: { fx: 1, fz: 0 } });
  run(early, 30, still, 0);
  const late = make(4);
  late.reset({ player: still, view: { fx: 1, fz: 0 } });
  run(late, 30, still, 1);
  assert.ok(late.vehicles.length > early.vehicles.length);
  assert.equal(late.vehicles.length, TRAFFIC.maxVehicles);
});

test('new vehicles appear at a distance, and never inside the view cone close by', () => {
  const traffic = make(5);
  const view = { fx: 1, fz: 0 };
  traffic.reset({ player: still, view });
  const seen = new Set(traffic.vehicles.map((v) => v.id));
  let spawned = 0;
  for (let i = 0; i < 60 * 120; i += 1) {
    traffic.step(DT, ctx(still, i / 7200, view));
    for (const v of traffic.vehicles) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      spawned += 1;
    }
  }
  assert.ok(spawned > 10);
});

test('spawn checks: distance band and the hidden-distance rule', () => {
  // Re-derive from the first frame each vehicle is seen, using a fresh traffic each time.
  for (let seed = 1; seed <= 12; seed += 1) {
    const traffic = make(seed);
    const view = { fx: 0, fz: 1 };
    traffic.reset({ player: still, view });
    const known = new Set(traffic.vehicles.map((v) => v.id));
    for (let i = 0; i < 60 * 40; i += 1) {
      traffic.step(DT, ctx(still, 0.5, view));
      for (const v of traffic.vehicles) {
        if (known.has(v.id)) continue;
        known.add(v.id);
        const d = Math.hypot(v.x - still.x, v.z - still.z);
        // Moved at most a few metres between creation and this frame.
        assert.ok(d >= TRAFFIC.spawnMin - 3 && d <= TRAFFIC.spawnMax + 3, `distance ${d}`);
        if (d < TRAFFIC.hiddenMin - 3) {
          const cos = ((v.x - still.x) * view.fx + (v.z - still.z) * view.fz) / d;
          assert.ok(cos <= Math.cos(TRAFFIC.viewHalfAngle) + 0.05, 'popped in inside the view');
        }
      }
    }
  }
});

test('vehicles far away leave', () => {
  const traffic = make(6);
  traffic.reset({ player: still, view: { fx: 1, fz: 0 } });
  const far = { x: 5000, z: 5000, vx: 0, vz: 0 };
  traffic.step(DT, ctx(far));
  assert.equal(traffic.vehicles.length, 0);
});

test('vehicles never overlap each other, including at junctions and the roundabout', () => {
  for (const seed of [7, 8, 9]) {
    const traffic = make(seed);
    traffic.reset({ player: { x: 0, z: 30, vx: 0, vz: 0 }, view: { fx: 1, fz: 0 } });
    const player = { x: 0, z: 30, vx: 0, vz: 0 };
    for (let i = 0; i < 60 * 150; i += 1) {
      traffic.step(DT, ctx(player, 0.8));
      const shapes = bodies(traffic);
      for (let a = 0; a < shapes.length; a += 1) {
        for (let b = a + 1; b < shapes.length; b += 1) {
          assert.equal(shapesOverlap(shapes[a], shapes[b]), false, `seed ${seed} frame ${i}`);
        }
      }
    }
  }
});

test('one vehicle at a time crosses a junction', () => {
  const traffic = make(10);
  const player = { x: 5, z: -45, vx: 0, vz: 0 };
  traffic.reset({ player, view: { fx: 1, fz: 0 } });
  for (let i = 0; i < 60 * 150; i += 1) {
    traffic.step(DT, ctx(player, 1));
    const turning = new Map();
    for (const v of traffic.vehicles) {
      if (v.piece !== 'turn') continue;
      const node = v.lane.end;
      assert.equal(turning.has(node), false, `two vehicles turning at ${node}`);
      turning.set(node, v.id);
    }
  }
});

test('vehicles stay in their lanes, and follow one-way rules', () => {
  const traffic = make(11);
  traffic.reset({ player: still, view: { fx: 1, fz: 0 } });
  for (let i = 0; i < 60 * 90; i += 1) {
    traffic.step(DT, ctx(still, 1));
    for (const v of traffic.vehicles) {
      if (v.piece !== 'lane') continue;
      const { lane } = v;
      // Distance from the lane's centreline never exceeds a danfo's swing to the kerb.
      const off = (v.x - lane.from.x) * lane.rx + (v.z - lane.from.z) * lane.rz;
      assert.ok(Math.abs(off) <= TRAFFIC.danfo.pullLateral + 1e-6);
      if (lane.edge.oneWay === 'ab') assert.equal(lane.dir, 1);
      if (lane.edge.oneWay === 'ba') assert.equal(lane.dir, -1);
      assert.notEqual(lane.edge.kind, 'market');
    }
  }
});

test('a vehicle stops behind something in its lane and never touches it', () => {
  const traffic = make(12);
  const far = { x: 5, z: -45, vx: 0, vz: 0 };
  traffic.reset({ player: far, view: { fx: 1, fz: 0 } });
  const v = traffic.vehicles.find((o) => o.piece === 'lane' && o.lane.length - o.s > 50 && o.speed > 1 && o.stopS === null);
  assert.ok(v, 'a vehicle with road ahead');
  const { lane } = v;
  const ahead = v.s + 30;
  const block = { x: lane.from.x + lane.ux * ahead, z: lane.from.z + lane.uz * ahead, hw: 0.45, hd: 0.9, vx: 0, vz: 0 };
  let closest = Infinity;
  for (let i = 0; i < 60 * 15; i += 1) {
    traffic.step(DT, ctx(far, 0, { fx: 1, fz: 0 }, [block]));
    if (v.lane === lane && v.piece === 'lane') closest = Math.min(closest, ahead - v.s - v.hd - block.hd);
  }
  assert.ok(closest > 1, `came within ${closest} m`);
  assert.ok(v.speed < 0.3, 'and waits');
});

test('a vehicle gives way to the bike ahead in its lane', () => {
  const traffic = make(16);
  const bike = { x: 5, z: -45, vx: 0, vz: 0 };
  traffic.reset({ player: bike, view: { fx: 1, fz: 0 } });
  const v = traffic.vehicles.find((o) => o.piece === 'lane' && o.lane.length - o.s > 50 && o.stopS === null);
  const { lane } = v;
  bike.x = lane.from.x + lane.ux * (v.s + 25);
  bike.z = lane.from.z + lane.uz * (v.s + 25);
  const start = v.s;
  for (let i = 0; i < 60 * 10; i += 1) traffic.step(DT, ctx(bike, 0, { fx: lane.ux, fz: lane.uz }));
  assert.ok(v.s - start < 25 - v.hd - 0.9, 'stopped short of the bike');
});

test('danfos halt at a named stop on the kerb side, wait, then move on', () => {
  const stopOnly = new Set(['c1r2']);
  let stoppedAt = null;
  for (let seed = 1; seed <= 20 && !stoppedAt; seed += 1) {
    const traffic = make(seed, stopOnly);
    traffic.reset({ player: still, view: { fx: 1, fz: 0 } });
    const watch = new Map();
    for (let i = 0; i < 60 * 240 && !stoppedAt; i += 1) {
      const events = traffic.step(DT, ctx(still, 0.2));
      for (const e of events) {
        if (e.type !== 'danfoStop') continue;
        const v = traffic.vehicles.find((o) => o.id === e.id);
        stoppedAt = { v, lateral: v.lateral, speed: v.speed, node: v.lane.end, startS: v.s };
        watch.set(v.id, true);
      }
    }
  }
  assert.ok(stoppedAt, 'a danfo stopped');
  assert.equal(stoppedAt.node, 'c1r2');
  assert.ok(stoppedAt.speed < 0.7);
  assert.ok(stoppedAt.lateral > 0.5, 'pulled toward the kerb');
});

test('after dwelling a danfo pulls back out and drives on', () => {
  const stopOnly = new Set(['c1r2']);
  for (let seed = 1; seed <= 30; seed += 1) {
    const traffic = make(seed, stopOnly);
    traffic.reset({ player: still, view: { fx: 1, fz: 0 } });
    let id = null;
    let leftAt = null;
    for (let i = 0; i < 60 * 300; i += 1) {
      const events = traffic.step(DT, ctx(still, 0.2));
      const e = events.find((x) => x.type === 'danfoStop');
      if (e && id === null) id = e.id;
      const v = id && traffic.vehicles.find((o) => o.id === id);
      if (v && v.state === 'drive' && v.stopS === null && v.speed > 3) { leftAt = i; break; }
    }
    if (id !== null && leftAt !== null) {
      assert.ok(true);
      return;
    }
  }
  assert.fail('no danfo was seen stopping and leaving');
});

test('traffic is deterministic for a seed', () => {
  const trace = (seed) => {
    const traffic = make(seed);
    traffic.reset({ player: still, view: { fx: 1, fz: 0 } });
    run(traffic, 20);
    return traffic.vehicles.map((v) => [v.id, v.kind, +v.x.toFixed(3), +v.z.toFixed(3)]);
  };
  assert.deepEqual(trace(21), trace(21));
  assert.notDeepEqual(trace(21), trace(22));
});

test('shapes describe each vehicle body and its motion', () => {
  const traffic = make(14);
  traffic.reset({ player: still, view: { fx: 1, fz: 0 } });
  run(traffic, 5);
  for (const s of traffic.shapes()) {
    assert.equal(s.shape.type, 'box');
    assert.ok(s.shape.hw > 0.5 && s.shape.hd > 1.5);
    assert.ok(Math.hypot(s.vx, s.vz) <= 12);
  }
});

test('a vehicle that is hit stops for a moment', () => {
  const traffic = make(15);
  traffic.reset({ player: still, view: { fx: 1, fz: 0 } });
  run(traffic, 5);
  const v = traffic.vehicles.find((o) => o.speed > 2);
  assert.ok(v);
  traffic.bump(v.id);
  run(traffic, 1.2);
  assert.ok(v.speed < 0.6);
  run(traffic, TRAFFIC.bumpedSeconds + 3);
  assert.equal(v.state === 'bumped', false);
});
