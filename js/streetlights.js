// The glow round each lamp head at night: one point sprite per streetlight, one draw call.

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial,
} from 'three';
import { STREETLIGHT } from './config.js';
import { createGlowTexture } from './textures.js';

/**
 * @param {{ props: { kind: string, x: number, z: number }[] }} city
 * @returns {{ points: Points, update: (glow: number) => void, dispose: () => void }}
 */
export function createStreetlights({ props }) {
  const lamps = props.filter((p) => p.kind === 'lamp');
  const positions = new Float32Array(lamps.length * 3);
  lamps.forEach((lamp, i) => positions.set([lamp.x, STREETLIGHT.height, lamp.z], i * 3));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const map = createGlowTexture();
  const material = new PointsMaterial({
    map, color: STREETLIGHT.color, size: STREETLIGHT.size, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.visible = false;
  // The lamps sit across the whole district, so one bounding sphere would be huge: skip culling.
  points.frustumCulled = false;
  return {
    points,
    /** @param {number} glow 0 in daylight to 1 at night */
    update(glow) {
      points.visible = glow > 0.02;
      material.opacity = glow;
    },
    dispose() { geometry.dispose(); material.dispose(); map.dispose(); },
  };
}
