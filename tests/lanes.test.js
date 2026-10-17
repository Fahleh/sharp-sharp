import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAFFIC } from '../js/config.js';
import { createLaneNet, evalTurn, turnPiece } from '../js/lanes.js';
import { graph } from '../js/map.js';

const net = createLaneNet(graph);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `expected ${b}, got ${a}`);

test('every road gives one lane per allowed direction, and one-way streets give one', () => {
  for (const edge of graph.edges) {
    const dirs = net.lanes.filter((l) => l.edge === edge).map((l) => l.dir).sort();
    if (edge.oneWay === 'ab') assert.deepEqual(dirs, [1]);
    else if (edge.oneWay === 'ba') assert.deepEqual(dirs, [-1]);
    else assert.deepEqual(dirs, [-1, 1]);
  }
  assert.ok(net.lanes.some((l) => l.edge.kind === 'bridge'));
});

test('traffic keeps right: an eastbound lane runs on the south side of its road', () => {
  const lane = net.lanes.find((l) => l.edge.kind === 'main' && l.ux === 1);
  const node = graph.nodes.get(lane.start);
  near(lane.from.z - node.z, lane.edge.hw * TRAFFIC.laneShare);
  const west = net.lanes.find((l) => l.edge === lane.edge && l.dir === -1);
  near(west.from.z - graph.nodes.get(west.start).z, -lane.edge.hw * TRAFFIC.laneShare);
});

test('roundabout lanes run along the ring centre, anticlockwise seen from above', () => {
  const ring = net.lanes.filter((l) => l.edge.kind === 'ring');
  assert.equal(ring.length, 8);
  for (const lane of ring) near(lane.offset, 0);
  // Sum of the turning between consecutive chords is negative for anticlockwise with x east, z south.
  let turning = 0;
  for (const lane of ring) {
    const next = net.successors(lane).find((l) => l.edge.kind === 'ring');
    turning += Math.atan2(lane.ux * next.uz - lane.uz * next.ux, lane.ux * next.ux + lane.uz * next.uz);
  }
  assert.ok(turning < 0 && Math.abs(Math.abs(turning) - Math.PI * 2) < 1e-6);
});

test('a lane always has somewhere to go, and never U-turns when it has a choice', () => {
  for (const lane of net.lanes) {
    const options = net.successors(lane);
    assert.ok(options.length > 0, lane.id);
    const others = net.lanes.filter((l) => l.start === lane.end && l.edge !== lane.edge);
    if (others.length > 0) assert.ok(options.every((l) => l.edge !== lane.edge), lane.id);
    for (const next of options) assert.equal(next.start, lane.end);
  }
});

test('a junction curve leaves one lane and joins the next on their own lines, facing along both', () => {
  let checked = 0;
  for (const lane of net.lanes) {
    for (const next of net.successors(lane)) {
      const piece = turnPiece(lane, next);
      const start = evalTurn(piece, 0);
      const end = evalTurn(piece, 1);
      // The curve starts on the lane it leaves, exitS metres along it, and ends enterS along the next.
      near(start.x, lane.from.x + lane.ux * piece.exitS, 1e-6);
      near(start.z, lane.from.z + lane.uz * piece.exitS, 1e-6);
      near(end.x, next.from.x + next.ux * piece.enterS, 1e-6);
      near(end.z, next.from.z + next.uz * piece.enterS, 1e-6);
      assert.ok(Math.abs(Math.sin(start.heading - lane.heading)) < 1e-6, `${lane.id} start heading`);
      assert.ok(Math.abs(Math.sin(end.heading - next.heading)) < 1e-6, `${lane.id} end heading`);
      assert.ok(piece.enterS > -2 && piece.enterS < 20, `${lane.id} enters ${piece.enterS}`);
      assert.ok(piece.exitS > lane.length - 20 && piece.exitS < lane.length + 5, `${lane.id} exits ${piece.exitS}`);
      checked += 1;
    }
  }
  assert.ok(checked > 100);
});

test('a right turn starts before the node and a left turn after it', () => {
  const lane = net.lanes.find((l) => l.edge.kind === 'street' && l.ux === 1);
  const pieces = net.successors(lane).map((n) => ({ n, p: turnPiece(lane, n) })).filter(({ p }) => p.angle > 1);
  for (const { n, p } of pieces) {
    // Facing east, south is to the right.
    const right = n.uz > 0;
    if (right) assert.ok(p.exitS < lane.length, 'right turn cuts the corner');
    else assert.ok(p.exitS > lane.length - 6, 'left turn runs on past the node centre');
  }
  assert.ok(pieces.length > 0);
});

test('a right-angle turn sweeps ninety degrees', () => {
  const lane = net.lanes.find((l) => l.edge.kind === 'street' && l.ux === 1);
  const turn = net.successors(lane).map((n) => turnPiece(lane, n)).find((p) => Math.abs(p.angle - Math.PI / 2) < 0.01);
  assert.ok(turn);
  assert.ok(turn.length > 3 && turn.length < 12);
});
