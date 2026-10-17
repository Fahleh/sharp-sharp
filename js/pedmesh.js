// Draws pedestrians: three instanced meshes (shirt, trousers, head), so the whole crowd costs
// three draw calls. Reads sim state only; the walk, the stumble and the step back are animation.

import {
  Color, DynamicDrawUsage, Euler, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3,
} from 'three';
import { createBatch } from './batch.js';
import { PEDS } from './config.js';

const PLAIN = { u: 0, v: 0 };
const WHITE = '#ffffff';
// Stumble timeline as fractions of its length: fall, lie, get up.
const FALL_END = 0.2;
const GET_UP = 0.7;
const FALL_PITCH = 1.45;
const LEAN_BACK = -0.25;

function shirtGeometry() {
  const b = createBatch();
  const { torso } = PEDS.look;
  b.box({ x: 0, y: 0.7 + torso / 2, z: 0, w: 0.36, h: torso, d: 0.22 }, WHITE, PLAIN);
  for (const side of [-1, 1]) b.box({ x: side * 0.24, y: 0.7 + torso / 2, z: 0, w: 0.1, h: torso, d: 0.1 }, WHITE, PLAIN);
  return b.build();
}

function legGeometry() {
  const b = createBatch();
  const { legs } = PEDS.look;
  for (const side of [-1, 1]) b.box({ x: side * 0.09, y: legs / 2, z: 0, w: 0.14, h: legs, d: 0.14 }, WHITE, PLAIN);
  return b.build();
}

function headGeometry() {
  const b = createBatch();
  b.sphere({ x: 0, y: 0.7 + PEDS.look.torso + PEDS.look.head, z: 0, rx: PEDS.look.head }, WHITE, PLAIN);
  return b.build();
}

/**
 * @param {{ terrain: { heightAt: (x: number, z: number) => number } }} world
 * @returns {{ group: Group, update: (peds: object[], alpha: number) => void, dispose: () => void }}
 */
export function createPedMeshes({ terrain }) {
  const group = new Group();
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const make = (geometry) => {
    const mesh = new InstancedMesh(geometry, material, PEDS.maxPeds);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.setColorAt(0, new Color(WHITE));
    group.add(mesh);
    return mesh;
  };
  const shirts = make(shirtGeometry());
  const legs = make(legGeometry());
  const heads = make(headGeometry());
  const colorShirt = PEDS.shirts.map((c) => new Color(c));
  const colorLegs = PEDS.trousers.map((c) => new Color(c));
  const colorSkin = PEDS.skins.map((c) => new Color(c));

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler(0, 0, 0, 'YXZ');
  const position = new Vector3();
  const scale = new Vector3();

  // How far the body is tipped, forward positive, for the stumble and the startle.
  function pitchOf(p) {
    if (p.state === 'stumble') {
      const t = 1 - p.timer / PEDS.stumbleSeconds;
      if (t < FALL_END) return (t / FALL_END) * FALL_PITCH;
      if (t < GET_UP) return FALL_PITCH;
      return FALL_PITCH * (1 - (t - GET_UP) / (1 - GET_UP));
    }
    return p.state === 'startled' ? LEAN_BACK : 0;
  }

  return {
    group,
    /**
     * @param {object[]} peds from the pedestrian sim
     * @param {number} alpha blend between the last two sim steps
     */
    update(peds, alpha) {
      peds.forEach((p, i) => {
        const x = p.px + (p.x - p.px) * alpha;
        const z = p.pz + (p.z - p.pz) * alpha;
        const gap = Math.atan2(Math.sin(p.heading - p.ph), Math.cos(p.heading - p.ph));
        const walking = p.state === 'walk' || p.state === 'cross' || p.link;
        const bob = walking ? Math.abs(Math.sin(p.phase)) * PEDS.look.bob : 0;
        const rock = walking ? Math.sin(p.phase) * PEDS.look.rock : 0;
        euler.set(pitchOf(p), p.ph + gap * alpha, rock);
        quaternion.setFromEuler(euler);
        position.set(x, terrain.heightAt(x, z) + bob, z);
        scale.setScalar(p.size);
        matrix.compose(position, quaternion, scale);
        shirts.setMatrixAt(i, matrix);
        legs.setMatrixAt(i, matrix);
        heads.setMatrixAt(i, matrix);
        shirts.setColorAt(i, colorShirt[p.shirt]);
        legs.setColorAt(i, colorLegs[p.trousers]);
        heads.setColorAt(i, colorSkin[p.skin]);
      });
      for (const mesh of [shirts, legs, heads]) {
        mesh.count = peds.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      for (const mesh of [shirts, legs, heads]) mesh.geometry.dispose();
      material.dispose();
    },
  };
}
