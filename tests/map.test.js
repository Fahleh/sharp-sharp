import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP, SPAWN, graph, pointOnEdge } from '../js/map.js';
import { createTerrain } from '../js/terrain.js';
import { findPath, isConnected, routeBetween } from '../js/route.js';
import { createRng } from '../js/rng.js';
import { generateOrder } from '../js/orders.js';
import { ORDERS } from '../js/config.js';

const terrain = createTerrain();

test('the road graph is connected and every node reaches every other', () => {
  assert.equal(isConnected(graph), true);
  const ids = [...graph.nodes.keys()];
  for (const from of ids) {
    for (const to of ids) assert.ok(findPath(graph, from, to), `${from} to ${to}`);
  }
});

test('graph edges are axis-aligned roads or roundabout chords, with a width', () => {
  for (const edge of graph.edges) {
    assert.ok(edge.hw > 0);
    if (edge.kind === 'ring') continue;
    const a = graph.nodes.get(edge.a);
    const b = graph.nodes.get(edge.b);
    assert.ok(a.x === b.x || a.z === b.z, `${edge.a}-${edge.b} is not axis-aligned`);
  }
});

test('there are at least six named stops, each on a real node', () => {
  assert.ok(MAP.landmarks.length >= 6);
  assert.equal(new Set(MAP.landmarks.map((l) => l.name)).size, MAP.landmarks.length);
  for (const l of MAP.landmarks) assert.ok(graph.nodes.has(l.node), l.name);
});

test('vendors and customers sit on the kerb of a real road, with unique ids and readable text', () => {
  const ids = new Set();
  for (const spot of [...MAP.vendors, ...MAP.customers]) {
    assert.ok(!ids.has(spot.id));
    ids.add(spot.id);
    const centre = pointOnEdge(spot.edgeRef, spot.t, 0);
    assert.ok(Math.abs(Math.hypot(spot.x - centre.x, spot.z - centre.z) - spot.edgeRef.hw) < 1e-9, spot.id);
    assert.notEqual(terrain.surfaceAt(spot.x, spot.z), 'water', spot.id);
  }
  for (const v of MAP.vendors) assert.ok(v.name.length > 0 && ['Food', 'Pharmacy', 'Parcel'].includes(v.type));
  for (const c of MAP.customers) assert.match(c.hint, /gate, [A-Z]/);
  assert.ok(MAP.vendors.length >= 8 && MAP.customers.length >= 12);
});

test('every vendor reaches every customer and the delivery legs suit the order rules', () => {
  let inRange = 0;
  for (const v of MAP.vendors) {
    for (const c of MAP.customers) {
      const route = routeBetween(graph, v, c);
      assert.ok(route, `${v.id} to ${c.id}`);
      if (route.length >= ORDERS.deliveryMin && route.length <= ORDERS.deliveryMax) inRange += 1;
    }
  }
  assert.ok(inRange > MAP.vendors.length * 4, 'plenty of valid pairs');
});

test('an order can always be generated from the start, and from every node', () => {
  const rng = createRng(5);
  const make = (from) => generateOrder({ rng, graph, vendors: MAP.vendors, customers: MAP.customers, from });
  assert.ok(make(SPAWN));
  for (const node of graph.nodes.values()) assert.ok(make(node), node.id);
});

test('the start is on a road, facing along it', () => {
  assert.equal(terrain.surfaceAt(SPAWN.x, SPAWN.z), 'road');
  const snapped = terrain.nearestRoadPoint(SPAWN.x, SPAWN.z, SPAWN.heading);
  assert.ok(Math.abs(Math.cos(snapped.heading - SPAWN.heading) - 1) < 1e-9);
});

test('terrain: roads, sidewalks, water, grass and the roundabout read as expected', () => {
  assert.equal(terrain.surfaceAt(-80, -100), 'road', 'main road centre');
  assert.equal(terrain.surfaceAt(-80, -100 + 7 + 1), 'sidewalk');
  assert.equal(terrain.surfaceAt(5, -150), 'water', 'inlet');
  assert.equal(terrain.surfaceAt(0, -206), 'water', 'lagoon');
  assert.equal(terrain.surfaceAt(5, -40), 'grass', 'park');
  assert.equal(terrain.surfaceAt(MAP.roundabout.x, MAP.roundabout.z), 'grass', 'island');
  assert.equal(terrain.surfaceAt(MAP.roundabout.x + MAP.roundabout.ringRadius, MAP.roundabout.z), 'road', 'ring');
  assert.equal(terrain.surfaceAt(9999, 9999), 'sand', 'outside the raster');
});

test('the bridge rises smoothly to its height at the middle and meets the ground at both ends', () => {
  const zc = graph.nodes.get(MAP.bridge.from).z;
  const x0 = graph.nodes.get(MAP.bridge.from).x + 4;
  const x1 = graph.nodes.get(MAP.bridge.to).x - 4;
  assert.equal(terrain.surfaceAt((x0 + x1) / 2, zc), 'road');
  assert.ok(Math.abs(terrain.heightAt((x0 + x1) / 2, zc) - MAP.bridge.height) < 0.05);
  assert.ok(terrain.heightAt(x0 + 0.1, zc) < 0.1);
  assert.ok(terrain.heightAt(x1 - 0.1, zc) < 0.1);
  let last = 0;
  let steepest = 0;
  for (let x = x0; x <= x1; x += 0.5) {
    const h = terrain.heightAt(x, zc);
    steepest = Math.max(steepest, Math.abs(h - last) / 0.5);
    last = h;
  }
  assert.ok(steepest < 0.2, `a gentle arc: steepest slope ${steepest}`);
  assert.equal(terrain.heightAt(-80, zc), 0, 'flat off the bridge');
});

test('sidewalks are raised by the kerb height', () => {
  assert.equal(terrain.heightAt(-80, -100 + 8), 0.12);
});

test('nearestRoadPoint puts you on the centreline facing the nearer direction of travel', () => {
  const east = terrain.nearestRoadPoint(-80, -92, Math.PI / 2 - 0.2);
  assert.ok(Math.abs(east.z - -100) < 1e-9);
  assert.ok(Math.abs(Math.sin(east.heading) - 1) < 1e-9);
  const west = terrain.nearestRoadPoint(-80, -92, -Math.PI / 2 + 0.1);
  assert.ok(Math.abs(Math.sin(west.heading) + 1) < 1e-9);
});
