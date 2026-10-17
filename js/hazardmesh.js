// Potholes and speed bumps painted on the road: one merged mesh, rebuilt when a shift starts
// and puts the hazards somewhere new.

import { Group, Mesh, MeshLambertMaterial } from 'three';
import { createBatch } from './batch.js';
import { HAZARDS } from './config.js';

const PLAIN = { u: 0, v: 0 };
const L = HAZARDS.look;

/**
 * @param {{ terrain: { heightAt: (x: number, z: number) => number } }} world
 * @returns {{ group: Group, rebuild: (hazards: ReturnType<typeof import('./hazards.js').generateHazards>) => void,
 *   dispose: () => void }}
 */
export function createHazardMesh({ terrain }) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new Group();
  let mesh = null;

  function clear() {
    if (!mesh) return;
    group.remove(mesh);
    mesh.geometry.dispose();
    mesh = null;
  }

  function rebuild({ potholes, bumps }) {
    clear();
    const batch = createBatch();
    for (const p of potholes) {
      const y = terrain.heightAt(p.x, p.z) + L.lift;
      // A lighter broken rim round a dark hole.
      batch.cylinder({ x: p.x, y, z: p.z, r: p.r * 1.25, h: L.rise }, L.rim, PLAIN);
      batch.cylinder({ x: p.x, y: y + L.rise, z: p.z, r: p.r, h: L.rise }, L.pothole, PLAIN);
    }
    for (const b of bumps) {
      const y = terrain.heightAt(b.x, b.z) + L.lift + L.rise;
      const width = (b.hw * 2) / L.stripes;
      const cos = Math.cos(b.angle);
      const sin = Math.sin(b.angle);
      for (let i = 0; i < L.stripes; i += 1) {
        const along = -b.hw + width * (i + 0.5);
        batch.box({
          x: b.x + cos * along, y, z: b.z - sin * along, w: width, h: L.rise * 2, d: b.hd * 2, rotY: b.angle,
        }, i % 2 === 0 ? L.bump : L.bumpStripe, PLAIN);
      }
    }
    const geometry = batch.build();
    if (!geometry) return;
    mesh = new Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  return { group, rebuild, dispose() { clear(); material.dispose(); } };
}
