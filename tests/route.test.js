import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGraph, findPath, isConnected, projectOnGraph, routeBetween } from '../js/route.js';

// A square with a diagonal shortcut, plus an island that nothing reaches.
//   a(0,0) --- b(10,0)
//    |   \      |
//   d(0,10) -- c(10,10)        island i(100,100)
const data = {
  nodes: [
    { id: 'a', x: 0, z: 0 }, { id: 'b', x: 10, z: 0 }, { id: 'c', x: 10, z: 10 },
    { id: 'd', x: 0, z: 10 }, { id: 'i', x: 100, z: 100 },
  ],
  edges: [
    { a: 'a', b: 'b' }, { a: 'b', b: 'c' }, { a: 'c', b: 'd' }, { a: 'd', b: 'a' }, { a: 'a', b: 'c' },
  ],
};
const graph = createGraph(data);

test('shortest path prefers the diagonal', () => {
  const path = findPath(graph, 'a', 'c');
  assert.deepEqual(path.ids, ['a', 'c']);
  assert.ok(Math.abs(path.length - Math.hypot(10, 10)) < 1e-9);
});

test('path goes around when the direct edge is missing', () => {
  const g = createGraph({ nodes: data.nodes, edges: data.edges.filter((e) => !(e.a === 'a' && e.b === 'c')) });
  const path = findPath(g, 'a', 'c');
  assert.equal(path.length, 20);
  assert.equal(path.ids.length, 3);
});

test('start equals goal gives a one-node path of zero length', () => {
  assert.deepEqual(findPath(graph, 'b', 'b'), { ids: ['b'], length: 0 });
});

test('unreachable and unknown ids give null', () => {
  assert.equal(findPath(graph, 'a', 'i'), null);
  assert.equal(findPath(graph, 'a', 'nope'), null);
  assert.equal(findPath(graph, 'nope', 'a'), null);
});

test('paths are symmetric in length', () => {
  const ids = ['a', 'b', 'c', 'd'];
  for (const from of ids) {
    for (const to of ids) {
      assert.ok(Math.abs(findPath(graph, from, to).length - findPath(graph, to, from).length) < 1e-9);
    }
  }
});

test('isConnected reports the island', () => {
  assert.equal(isConnected(graph), false);
  assert.equal(isConnected(createGraph({ nodes: data.nodes.slice(0, 4), edges: data.edges })), true);
});

test('an edge naming an unknown node, or joining a node to itself, is rejected', () => {
  assert.throws(() => createGraph({ nodes: data.nodes, edges: [{ a: 'a', b: 'zzz' }] }));
  assert.throws(() => createGraph({ nodes: data.nodes, edges: [{ a: 'a', b: 'a' }] }));
});

test('projectOnGraph snaps to the nearest centreline', () => {
  const hit = projectOnGraph(graph, 5, -3);
  assert.equal(hit.edge.a, 'a');
  assert.equal(hit.edge.b, 'b');
  assert.ok(Math.abs(hit.x - 5) < 1e-9 && Math.abs(hit.z) < 1e-9);
  assert.ok(Math.abs(hit.distance - 3) < 1e-9);
});

test('routeBetween on one edge is the straight run', () => {
  const route = routeBetween(graph, { x: 2, z: 0.5 }, { x: 8, z: -0.5 });
  assert.ok(Math.abs(route.length - 6) < 1e-9);
  assert.equal(route.points.length, 2);
});

test('routeBetween across edges adds the legs to the nodes', () => {
  const g = createGraph({ nodes: data.nodes.slice(0, 4), edges: data.edges.slice(0, 4) });
  const route = routeBetween(g, { x: 2, z: 0 }, { x: 10, z: 8 });
  // a-b edge at t=0.2 to b-c edge at t=0.8: 8 to b, then 8 up.
  assert.ok(Math.abs(route.length - 16) < 1e-9);
  assert.deepEqual(route.points.map((p) => [p.x, p.z]), [[2, 0], [10, 0], [10, 8]]);
});

test('routeBetween returns null across components', () => {
  const g = createGraph({
    nodes: [...data.nodes, { id: 'j', x: 110, z: 100 }],
    edges: [...data.edges, { a: 'i', b: 'j' }],
  });
  assert.equal(routeBetween(g, { x: 5, z: 0 }, { x: 105, z: 100 }), null);
});
