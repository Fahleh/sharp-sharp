// The minimap: a heading-up circle drawn from the road graph, with the A* route, the target
// and the bike. The whole map is painted once; each frame only moves and rotates it.

import { MINIMAP } from './config.js';

const BLOCK_FILL = Object.freeze({ park: MINIMAP.park, field: MINIMAP.park, estate: MINIMAP.park });

function paintBase({ map, blockRect }) {
  const { world, graph } = map;
  const scale = MINIMAP.baseScale;
  const base = document.createElement('canvas');
  base.width = (world.x1 - world.x0) * scale;
  base.height = (world.z1 - world.z0) * scale;
  const g = base.getContext('2d');
  g.scale(scale, scale);
  g.translate(-world.x0, -world.z0);
  g.fillStyle = MINIMAP.land;
  g.fillRect(world.x0, world.z0, world.x1 - world.x0, world.z1 - world.z0);
  g.fillStyle = MINIMAP.water;
  for (const w of [map.water.lagoon, map.water.inlet]) g.fillRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);
  for (const block of map.blocks) {
    const fill = BLOCK_FILL[block.type];
    if (!fill) continue;
    const r = blockRect(block);
    g.fillStyle = fill;
    g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
  }
  const roads = graph.edges.filter((e) => e.kind !== 'ring');
  // Outline pass then fill pass, so junctions merge cleanly.
  for (const [extra, color] of [[MINIMAP.outline, MINIMAP.roadEdge], [0, MINIMAP.road]]) {
    g.strokeStyle = color;
    g.lineCap = 'butt';
    for (const e of roads) {
      const a = graph.nodes.get(e.a);
      const b = graph.nodes.get(e.b);
      g.lineWidth = e.hw * 2 + extra;
      g.beginPath();
      g.moveTo(a.x, a.z);
      g.lineTo(b.x, b.z);
      g.stroke();
    }
  }
  const ring = map.roundabout;
  const ringHalf = graph.edges.find((e) => e.kind === 'ring').hw;
  for (const [extra, color] of [[MINIMAP.outline, MINIMAP.roadEdge], [0, MINIMAP.road]]) {
    g.strokeStyle = color;
    g.lineWidth = ringHalf * 2 + extra;
    g.beginPath();
    g.arc(ring.x, ring.z, ring.ringRadius, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = MINIMAP.park;
  g.beginPath();
  g.arc(ring.x, ring.z, ring.island - 1, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = MINIMAP.stop;
  for (const l of map.landmarks) {
    g.beginPath();
    g.arc(l.x, l.z, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  return base;
}

/**
 * @param {{ canvas: HTMLCanvasElement, map: object, blockRect: Function }} input
 * @returns {{ draw: Function }}
 */
export function createMinimap({ canvas, map, blockRect }) {
  const base = paintBase({ map, blockRect });
  const g = canvas.getContext('2d');
  const half = MINIMAP.size / 2;
  const pxPerMetre = half / MINIMAP.radius;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = MINIMAP.size * dpr;
  canvas.height = MINIMAP.size * dpr;

  /**
   * @param {{ bike: { x: number, z: number, heading: number }, route: Array<{ x: number, z: number }>|null,
   *   target: { x: number, z: number, color: string }|null }} frame
   */
  function draw({ bike, route, target }) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, MINIMAP.size, MINIMAP.size);
    g.save();
    g.beginPath();
    g.arc(half, half, half - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = MINIMAP.land;
    g.fillRect(0, 0, MINIMAP.size, MINIMAP.size);
    // Heading up: turn the world so the bike's forward points to the top of the circle.
    const angle = bike.heading - Math.PI;
    g.translate(half, half);
    g.rotate(angle);
    g.scale(pxPerMetre, pxPerMetre);
    g.translate(-bike.x, -bike.z);
    g.drawImage(base, map.world.x0, map.world.z0, base.width / MINIMAP.baseScale, base.height / MINIMAP.baseScale);
    if (route && route.length > 1) {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const [width, color] of [[7 / pxPerMetre, MINIMAP.routeEdge], [4.5 / pxPerMetre, MINIMAP.route]]) {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(route[0].x, route[0].z);
        for (const p of route.slice(1)) g.lineTo(p.x, p.z);
        g.stroke();
      }
    }
    if (target) {
      g.fillStyle = target.color;
      g.strokeStyle = '#1d1d1d';
      g.lineWidth = 2 / pxPerMetre;
      g.beginPath();
      g.arc(target.x, target.z, 6 / pxPerMetre, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.restore();

    // A target beyond the circle is shown on the rim, pointing out.
    if (target) {
      const dx = target.x - bike.x;
      const dz = target.z - bike.z;
      const x = (dx * Math.cos(angle) - dz * Math.sin(angle)) * pxPerMetre;
      const y = (dx * Math.sin(angle) + dz * Math.cos(angle)) * pxPerMetre;
      const distance = Math.hypot(x, y);
      if (distance > half - 8) {
        const rim = Math.atan2(y, x);
        g.save();
        g.translate(half + Math.cos(rim) * (half - 8), half + Math.sin(rim) * (half - 8));
        g.rotate(rim);
        g.fillStyle = target.color;
        g.strokeStyle = '#1d1d1d';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(7, 0);
        g.lineTo(-5, 6);
        g.lineTo(-5, -6);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      }
    }

    // The bike, always at the centre, pointing up.
    g.save();
    g.translate(half, half);
    g.fillStyle = MINIMAP.bike;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -MINIMAP.arrow);
    g.lineTo(MINIMAP.arrow * 0.7, MINIMAP.arrow * 0.8);
    g.lineTo(0, MINIMAP.arrow * 0.35);
    g.lineTo(-MINIMAP.arrow * 0.7, MINIMAP.arrow * 0.8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  return { draw };
}
