// Draws traffic: one instanced mesh per vehicle kind and one for the lights, so the whole road
// costs a handful of draw calls however many vehicles there are. Reads sim state only.

import {
  AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial,
  PlaneGeometry, Quaternion, Vector3, Group, Euler,
} from 'three';
import { createBatch } from './batch.js';
import { TRAFFIC, VEHICLE_LOOK as L } from './config.js';

const PLAIN = { u: 0, v: 0 };
const WHITE = '#ffffff';

function carGeometry() {
  const { hw, hd } = TRAFFIC.kinds.car;
  const b = createBatch();
  b.box({ x: 0, y: 0.62, z: 0, w: hw * 2, h: 0.72, d: hd * 2 }, WHITE, PLAIN);
  b.box({ x: 0, y: 1.2, z: -0.25, w: hw * 2 - 0.2, h: 0.62, d: hd * 1.05 }, L.glass, PLAIN);
  b.box({ x: 0, y: 1.54, z: -0.25, w: hw * 2 - 0.45, h: 0.08, d: hd * 0.9 }, WHITE, PLAIN);
  b.box({ x: 0, y: 0.3, z: 0, w: hw * 2 - 0.1, h: 0.3, d: hd * 2 - 0.2 }, L.trim, PLAIN);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box({ x: sx * (hw - 0.05), y: 0.32, z: sz * (hd - 0.7), w: 0.24, h: 0.64, d: 0.7 }, L.tyre, PLAIN);
  return b.build();
}

function danfoGeometry() {
  const { hw, hd } = TRAFFIC.kinds.danfo;
  const b = createBatch();
  b.box({ x: 0, y: 1.0, z: 0, w: hw * 2, h: 1.3, d: hd * 2 }, L.danfoBody, PLAIN);
  b.box({ x: 0, y: 1.85, z: 0, w: hw * 2 - 0.1, h: 0.5, d: hd * 2 - 0.3 }, L.danfoRoof, PLAIN);
  b.box({ x: 0, y: 1.0, z: 0, w: hw * 2 + 0.04, h: 0.2, d: hd * 2 + 0.04 }, L.danfoStripe, PLAIN);
  // Window band along both sides and the windscreen.
  for (const side of [-1, 1]) b.box({ x: side * (hw + 0.01), y: 1.48, z: -0.1, w: 0.04, h: 0.46, d: hd * 2 - 1.2 }, L.glass, PLAIN);
  b.box({ x: 0, y: 1.5, z: hd + 0.01, w: hw * 2 - 0.3, h: 0.5, d: 0.04 }, L.glass, PLAIN);
  b.box({ x: 0, y: 0.38, z: 0, w: hw * 2 - 0.1, h: 0.3, d: hd * 2 - 0.2 }, L.trim, PLAIN);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box({ x: sx * (hw - 0.05), y: 0.34, z: sz * (hd - 0.85), w: 0.26, h: 0.68, d: 0.76 }, L.tyre, PLAIN);
  return b.build();
}

const BUILDERS = { car: carGeometry, danfo: danfoGeometry };

/**
 * @param {{ terrain: { heightAt: (x: number, z: number) => number } }} world
 * @returns {{ group: Group, update: (vehicles: object[], alpha: number, glow: number) => void, dispose: () => void }}
 */
export function createVehicleMeshes({ terrain }) {
  const group = new Group();
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshes = new Map();
  for (const kind of Object.keys(TRAFFIC.kinds)) {
    const mesh = new InstancedMesh(BUILDERS[kind](), material, TRAFFIC.maxVehicles);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // Instances move every frame, so the bounding sphere three computes once would be wrong.
    mesh.frustumCulled = false;
    mesh.count = 0;
    meshes.set(kind, mesh);
    group.add(mesh);
  }
  // Car bodies take a colour per instance; danfos keep their painted yellow.
  const car = meshes.get('car');
  const tint = new Color();
  car.setColorAt(0, tint.set(WHITE));

  const lightGeometry = new PlaneGeometry(L.lightWidth, L.lightHeight);
  const lightMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const lights = new InstancedMesh(lightGeometry, lightMaterial, TRAFFIC.maxVehicles * 4);
  lights.instanceMatrix.setUsage(DynamicDrawUsage);
  lights.frustumCulled = false;
  lights.count = 0;
  lights.visible = false;
  lights.setColorAt(0, tint.set(L.headlight));
  group.add(lights);

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const headColor = new Color(L.headlight);
  const tailColor = new Color(L.tailLight);

  const place = (x, y, z, heading) => {
    euler.set(0, heading, 0);
    quaternion.setFromEuler(euler);
    position.set(x, y, z);
    return matrix.compose(position, quaternion, scale);
  };

  return {
    group,
    /**
     * @param {object[]} vehicles from the traffic sim
     * @param {number} alpha blend between the last two sim steps
     * @param {number} glow 0 in daylight to 1 at night: how bright the lights are
     */
    update(vehicles, alpha, glow) {
      const counts = new Map([...meshes.keys()].map((k) => [k, 0]));
      let lightCount = 0;
      for (const v of vehicles) {
        const mesh = meshes.get(v.kind);
        const i = counts.get(v.kind);
        counts.set(v.kind, i + 1);
        const x = v.px + (v.x - v.px) * alpha;
        const z = v.pz + (v.z - v.pz) * alpha;
        const gap = Math.atan2(Math.sin(v.heading - v.ph), Math.cos(v.heading - v.ph));
        const heading = v.ph + gap * alpha;
        const y = terrain.heightAt(x, z);
        mesh.setMatrixAt(i, place(x, y, z, heading));
        if (v.kind === 'car') car.setColorAt(i, tint.set(TRAFFIC.carColors[v.color]));
        if (glow > 0.02) {
          const fx = Math.sin(heading);
          const fz = Math.cos(heading);
          const rx = -fz;
          const rz = fx;
          for (const end of [1, -1]) {
            for (const side of [-1, 1]) {
              const reach = (v.hd + 0.03) * end;
              const lateral = (v.hw - L.lightInset) * side;
              lights.setMatrixAt(lightCount, place(x + fx * reach + rx * lateral, y + L.lightY, z + fz * reach + rz * lateral, end === 1 ? heading : heading + Math.PI));
              lights.setColorAt(lightCount, end === 1 ? headColor : tailColor);
              lightCount += 1;
            }
          }
        }
      }
      for (const [kind, mesh] of meshes) {
        mesh.count = counts.get(kind);
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (car.instanceColor) car.instanceColor.needsUpdate = true;
      lights.count = lightCount;
      lights.visible = glow > 0.02;
      lightMaterial.opacity = glow * L.lightMax;
      if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const mesh of meshes.values()) mesh.geometry.dispose();
      lightGeometry.dispose();
      material.dispose();
      lightMaterial.dispose();
    },
  };
}
