import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKE } from '../js/config.js';
import { bikeCircles, deepestContact, shapesOverlap } from '../js/collide.js';
import { generateCity } from '../js/city.js';
import { MAP, SPAWN, graph } from '../js/map.js';
import { createTerrain } from '../js/terrain.js';

const terrain = createTerrain();
const city = generateCity({ terrain });
const body = (x, z, heading) => bikeCircles({ x, z, heading }, { radius: BIKE.radius, circleOffset: BIKE.circleOffset });

test('the same seed gives the same city, another seed gives another', () => {
  const summary = (c) => JSON.stringify([c.buildings, c.props, c.signs, c.crossings, c.solids]);
  assert.equal(summary(generateCity({ terrain })), summary(city));
  assert.notEqual(summary(generateCity({ terrain, seed: 7 })), summary(city));
});

test('the district has a believable amount in it', () => {
  assert.ok(city.buildings.length > 120 && city.buildings.length < 260);
  assert.ok(city.props.length > 400 && city.props.length < 1000);
  assert.ok(city.signs.some((s) => s.kind === 'billboard'));
  assert.equal(city.signs.filter((s) => s.kind === 'stop').length, MAP.landmarks.length);
  assert.equal(city.crossings.length > 6, true);
  assert.equal(city.props.filter((p) => p.kind === 'light').length >= 8, true);
});

test('buildings stand on lots, never on a road, sidewalk or water', () => {
  for (const b of city.buildings) {
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 0]]) {
      const surface = terrain.surfaceAt(b.x + sx * (b.w / 2 - 0.05), b.z + sz * (b.d / 2 - 0.05));
      assert.ok(['plaza', 'grass', 'sand'].includes(surface), `${b.id} on ${surface}`);
    }
  }
});

test('buildings do not overlap each other', () => {
  const boxes = city.buildings.map((b) => ({ type: 'box', x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 }));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) assert.equal(shapesOverlap(boxes[i], boxes[j]), false, `${city.buildings[i].id} ${city.buildings[j].id}`);
  }
});

test('every vendor has its kiosk and every customer its gate', () => {
  for (const v of MAP.vendors) assert.ok(city.props.some((p) => p.kind === 'kiosk' && p.vendor === v.id), v.id);
  for (const c of MAP.customers) assert.ok(city.props.some((p) => p.kind === 'gate' && p.customer === c.id), c.id);
});

test('props are not stacked on each other', () => {
  const solid = city.props.filter((p) => p.kind !== 'rubbish' && p.kind !== 'goal');
  assert.ok(solid.length > 300);
  // Solids were added through the placer, which refuses overlaps; spot check a window of them.
  const shapes = city.solids.slice(city.solids.length - 300);
  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      if (Math.hypot(shapes[i].x - shapes[j].x, shapes[i].z - shapes[j].z) < 6) assert.equal(shapesOverlap(shapes[i], shapes[j]), false);
    }
  }
});

test('the start is clear of everything', () => {
  assert.equal(deepestContact(body(SPAWN.x, SPAWN.z, SPAWN.heading), city.solids), null);
});

test('every road can be ridden end to end: the centreline is free of solids', () => {
  for (const edge of graph.edges) {
    const a = graph.nodes.get(edge.a);
    const b = graph.nodes.get(edge.b);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const hit = deepestContact(body(x, z, heading), city.index.query(x, z, 4));
      assert.equal(hit, null, `${edge.a}-${edge.b} blocked near ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  }
});

test('the roundabout ring is free to ride all the way round', () => {
  const { x, z, ringRadius } = MAP.roundabout;
  for (let a = 0; a < Math.PI * 2; a += 0.02) {
    const px = x + Math.sin(a) * ringRadius;
    const pz = z - Math.cos(a) * ringRadius;
    assert.equal(deepestContact(body(px, pz, a + Math.PI / 2), city.index.query(px, pz, 4)), null);
  }
});

test('water, walls and the island are solid, and the bridge deck is not', () => {
  // Facing east, along the deck, so the bike's length does not reach the rail.
  const blocked = (x, z) => deepestContact(body(x, z, Math.PI / 2), city.index.query(x, z, 4)) !== null;
  assert.equal(blocked(5, -150), true, 'inlet');
  assert.equal(blocked(0, -250), true, 'lagoon');
  assert.equal(blocked(MAP.roundabout.x, MAP.roundabout.z), true, 'island');
  assert.equal(blocked(-MAP.world.wallX + 0.4, 0), true, 'perimeter wall');
  const zc = graph.nodes.get(MAP.bridge.from).z;
  assert.equal(blocked(5, zc), false, 'mid-deck');
  assert.equal(blocked(5, zc - 10.2), false, 'inside the rail');
  assert.equal(blocked(5, zc - 11.3), true, 'the rail');
});

test('sidewalks leave room to ride: no sidewalk cell is walled in by props on both kerbs', () => {
  // Along every road the free width between solids on the sidewalk must exceed the bike body.
  for (const edge of graph.edges.filter((e) => e.kind !== 'ring' && e.kind !== 'bridge')) {
    const a = graph.nodes.get(edge.a);
    const b = graph.nodes.get(edge.b);
    const horizontal = a.z === b.z;
    for (let t = 0.1; t < 0.9; t += 0.05) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      // The road carriageway itself is never blocked by a prop.
      for (const offset of [-edge.hw + 0.6, edge.hw - 0.6]) {
        const px = horizontal ? x : x + offset;
        const pz = horizontal ? z + offset : z;
        assert.equal(deepestContact(body(px, pz, horizontal ? Math.PI / 2 : 0), city.index.query(px, pz, 4)), null, `${edge.a}-${edge.b} at ${px.toFixed(1)}, ${pz.toFixed(1)}`);
      }
    }
  }
});
