// Road graph and A* routing. Pure: no three.js, no DOM.
// Routing here is for the player's guidance and the fare, so streets are treated as two-way;
// one-way rules belong to the traffic that follows lanes.

/**
 * @typedef {{ id: string, x: number, z: number }} GraphNode
 * @typedef {{ a: string, b: string }} GraphEdge any other fields ride along untouched
 * @typedef {{ nodes: Map<string, GraphNode>, edges: Array<GraphEdge & { length: number }>,
 *   links: Map<string, Array<{ to: string, length: number, edge: object }>> }} Graph
 */

const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

/**
 * @param {{ nodes: GraphNode[], edges: GraphEdge[] }} data
 * @returns {Graph}
 */
export function createGraph({ nodes, edges }) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const links = new Map(nodes.map((node) => [node.id, []]));
  const built = edges.map((edge) => {
    const a = nodeMap.get(edge.a);
    const b = nodeMap.get(edge.b);
    if (!a || !b) throw new Error(`Edge ${edge.a}-${edge.b} names an unknown node`);
    const length = dist(a.x, a.z, b.x, b.z);
    if (length === 0) throw new Error(`Edge ${edge.a}-${edge.b} has no length`);
    const full = { ...edge, length };
    links.get(edge.a).push({ to: edge.b, length, edge: full });
    links.get(edge.b).push({ to: edge.a, length, edge: full });
    return full;
  });
  return { nodes: nodeMap, edges: built, links };
}

// Small binary min-heap keyed by priority.
function createHeap() {
  const items = [];
  const swap = (i, j) => { [items[i], items[j]] = [items[j], items[i]]; };
  return {
    get size() { return items.length; },
    push(value, priority) {
      items.push({ value, priority });
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (items[parent].priority <= items[i].priority) break;
        swap(i, parent);
        i = parent;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length > 0) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let smallest = i;
          if (l < items.length && items[l].priority < items[smallest].priority) smallest = l;
          if (r < items.length && items[r].priority < items[smallest].priority) smallest = r;
          if (smallest === i) break;
          swap(i, smallest);
          i = smallest;
        }
      }
      return top.value;
    },
  };
}

/**
 * Shortest path between two nodes.
 * @param {Graph} graph
 * @param {string} from node id
 * @param {string} to node id
 * @returns {{ ids: string[], length: number } | null} null when unreachable or an id is unknown
 */
export function findPath(graph, from, to) {
  const start = graph.nodes.get(from);
  const goal = graph.nodes.get(to);
  if (!start || !goal) return null;
  if (from === to) return { ids: [from], length: 0 };

  const best = new Map([[from, 0]]);
  const cameFrom = new Map();
  const open = createHeap();
  const closed = new Set();
  open.push(from, dist(start.x, start.z, goal.x, goal.z));

  while (open.size > 0) {
    const current = open.pop();
    if (current === to) {
      const ids = [to];
      for (let at = to; cameFrom.has(at);) {
        at = cameFrom.get(at);
        ids.push(at);
      }
      return { ids: ids.reverse(), length: best.get(to) };
    }
    if (closed.has(current)) continue;
    closed.add(current);
    const here = best.get(current);
    for (const link of graph.links.get(current)) {
      const cost = here + link.length;
      if (cost < (best.get(link.to) ?? Infinity)) {
        best.set(link.to, cost);
        cameFrom.set(link.to, current);
        const node = graph.nodes.get(link.to);
        open.push(link.to, cost + dist(node.x, node.z, goal.x, goal.z));
      }
    }
  }
  return null;
}

/**
 * Nearest point on any road centreline.
 * @param {Graph} graph
 * @param {number} x
 * @param {number} z
 * @returns {{ edge: object, t: number, x: number, z: number, distance: number }}
 */
export function projectOnGraph(graph, x, z) {
  let best = null;
  for (const edge of graph.edges) {
    const a = graph.nodes.get(edge.a);
    const b = graph.nodes.get(edge.b);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const distance = dist(x, z, px, pz);
    if (!best || distance < best.distance) best = { edge, t, x: px, z: pz, distance };
  }
  return best;
}

/**
 * Route between two world points, snapped to the road centrelines.
 * @param {Graph} graph
 * @param {{ x: number, z: number }} from
 * @param {{ x: number, z: number }} to
 * @returns {{ points: Array<{ x: number, z: number }>, length: number } | null}
 */
export function routeBetween(graph, from, to) {
  const s = projectOnGraph(graph, from.x, from.z);
  const e = projectOnGraph(graph, to.x, to.z);
  if (s.edge === e.edge) {
    return { points: [{ x: s.x, z: s.z }, { x: e.x, z: e.z }], length: dist(s.x, s.z, e.x, e.z) };
  }
  const ends = (p) => [
    { id: p.edge.a, cost: p.t * p.edge.length },
    { id: p.edge.b, cost: (1 - p.t) * p.edge.length },
  ];
  let best = null;
  for (const first of ends(s)) {
    for (const last of ends(e)) {
      const path = findPath(graph, first.id, last.id);
      if (!path) continue;
      const length = first.cost + path.length + last.cost;
      if (!best || length < best.length) best = { path, length };
    }
  }
  if (!best) return null;
  const points = [
    { x: s.x, z: s.z },
    ...best.path.ids.map((id) => ({ x: graph.nodes.get(id).x, z: graph.nodes.get(id).z })),
    { x: e.x, z: e.z },
  ];
  return { points, length: best.length };
}

/**
 * @param {Graph} graph
 * @returns {boolean} true when every node can reach every other node
 */
export function isConnected(graph) {
  const ids = [...graph.nodes.keys()];
  if (ids.length === 0) return true;
  const seen = new Set([ids[0]]);
  const stack = [ids[0]];
  while (stack.length > 0) {
    for (const link of graph.links.get(stack.pop())) {
      if (!seen.has(link.to)) {
        seen.add(link.to);
        stack.push(link.to);
      }
    }
  }
  return seen.size === ids.length;
}
