// The target marker in the world: a tall translucent column and a pulsing ground ring at the
// active pickup or drop-off. The column is taller than any building so it shows over the city.

import {
  CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, RingGeometry,
} from 'three';
import { MARKERS, ORDERS } from './config.js';

function beaconGeometry() {
  const geometry = new CylinderGeometry(MARKERS.beaconRadius, MARKERS.beaconRadius, MARKERS.beaconHeight, 20, 1, true);
  geometry.translate(0, MARKERS.beaconHeight / 2, 0);
  // Fade out toward the top: the colour attribute carries alpha as its fourth channel.
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i += 1) {
    const height = position.getY(i) / MARKERS.beaconHeight;
    colors.set([1, 1, 1, 1 - height], i * 4);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
  return geometry;
}

/**
 * @returns {{ group: Group, setTarget: (target: { x: number, z: number, y: number, kind: 'pickup'|'drop' }|null) => void,
 *   update: (seconds: number, calm: boolean) => void, dispose: () => void }}
 */
export function createMarkers() {
  const group = new Group();
  group.visible = false;
  const beaconMaterial = new MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: MARKERS.beaconOpacity, depthWrite: false, side: DoubleSide, fog: false,
  });
  const ringMaterial = new MeshBasicMaterial({
    transparent: true, opacity: MARKERS.ringOpacity, depthWrite: false, side: DoubleSide, fog: false,
  });
  const beacon = new Mesh(beaconGeometry(), beaconMaterial);
  const radius = ORDERS.pickupRadius;
  const ring = new Mesh(new RingGeometry(radius - 0.5, radius, MARKERS.ringSegments), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  group.add(beacon, ring);

  return {
    group,
    setTarget(target) {
      group.visible = target !== null;
      if (!target) return;
      group.position.set(target.x, target.y, target.z);
      const color = target.kind === 'pickup' ? MARKERS.pickup : MARKERS.drop;
      beaconMaterial.color.set(color);
      ringMaterial.color.set(color);
    },
    /** @param {boolean} calm true when the player prefers reduced motion: the ring stays still */
    update(seconds, calm) {
      ring.scale.setScalar(calm ? 1 : 1 + Math.sin(seconds * MARKERS.pulseSpeed) * MARKERS.pulseDepth);
    },
    dispose() {
      beacon.geometry.dispose();
      ring.geometry.dispose();
      beaconMaterial.dispose();
      ringMaterial.dispose();
    },
  };
}
