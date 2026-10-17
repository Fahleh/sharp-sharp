// Rain drops: short line segments in a box that follows the camera, in one draw call. Drops
// fall, lean with the wind and wrap round the box, so the rain never runs out.

import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, LineBasicMaterial, LineSegments,
} from 'three';
import { WEATHER } from './config.js';

/**
 * @param {{ rng: ReturnType<typeof import('./rng.js').createRng>, reducedMotion: () => boolean }} options
 * @returns {{ lines: LineSegments, update: (frame: { dt: number, rain: number, camera: import('three').Vector3 }) => void,
 *   dispose: () => void }}
 */
export function createRainMesh({ rng, reducedMotion }) {
  const d = WEATHER.drops;
  const head = new Float32Array(d.count * 3);
  for (let i = 0; i < d.count; i += 1) {
    head[i * 3] = rng.range(-d.box, d.box);
    head[i * 3 + 1] = rng.range(0, d.height);
    head[i * 3 + 2] = rng.range(-d.box, d.box);
  }
  const positions = new Float32Array(d.count * 6);
  const geometry = new BufferGeometry();
  const attribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  geometry.setDrawRange(0, 0);
  const material = new LineBasicMaterial({
    color: d.color, transparent: true, opacity: d.opacity, depthWrite: false, fog: false,
  });
  const lines = new LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;
  lines.renderOrder = 2;

  const wrap = (v, size) => ((((v + size) % (size * 2)) + size * 2) % (size * 2)) - size;

  function update({ dt, rain, camera }) {
    lines.visible = rain > 0.01;
    if (!lines.visible) return;
    const live = Math.round((reducedMotion() ? d.reducedCount : d.count) * rain);
    // Each drop is a head and a tail one drop-length up and back into the wind.
    const lean = d.wind / d.fall;
    for (let i = 0; i < live; i += 1) {
      const k = i * 3;
      head[k] += d.wind * dt;
      head[k + 1] -= d.fall * dt;
      if (head[k + 1] < 0) head[k + 1] += d.height;
      // Drops are kept in camera-relative terms so the box follows the camera without a jump.
      const x = camera.x + wrap(head[k] - camera.x, d.box);
      const z = camera.z + wrap(head[k + 2] - camera.z, d.box);
      head[k] = x;
      head[k + 2] = z;
      const y = camera.y - 3 + head[k + 1];
      const o = i * 6;
      positions[o] = x;
      positions[o + 1] = y;
      positions[o + 2] = z;
      positions[o + 3] = x - lean * d.length;
      positions[o + 4] = y + d.length;
      positions[o + 5] = z;
    }
    geometry.setDrawRange(0, live * 2);
    attribute.needsUpdate = true;
  }

  return { lines, update, dispose() { geometry.dispose(); material.dispose(); } };
}
