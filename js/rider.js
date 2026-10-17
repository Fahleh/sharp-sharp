// The bike and the rider on it: meshes only. Reads sim state, decides nothing.
// The bike faces +z. The root sits on the ground under the bike; it yaws with the heading,
// pitches with the slope and rolls into turns.

import {
  CircleGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
} from 'three';
import { createBatch } from './batch.js';
import { buildRiderGeometry } from './character.js';
import { BIKE, RIDER } from './config.js';

const PLAIN = { u: 0, v: 0 };

function wheelGeometry() {
  const batch = createBatch();
  const turn = new Matrix4().makeRotationZ(Math.PI / 2);
  const tyre = new CylinderGeometry(RIDER.wheelRadius, RIDER.wheelRadius, 0.14, 14);
  const rim = new CylinderGeometry(RIDER.wheelRadius * 0.62, RIDER.wheelRadius * 0.62, 0.16, 10);
  const hub = new CylinderGeometry(0.05, 0.05, 0.2, 6);
  const spoke = new CylinderGeometry(0.02, 0.02, RIDER.wheelRadius * 1.1, 4);
  batch.add(tyre, turn, RIDER.tyre);
  batch.add(rim, turn, RIDER.rim);
  batch.add(hub, turn, RIDER.metal);
  // Dark spokes make the spin readable.
  for (let i = 0; i < 3; i += 1) batch.add(spoke, new Matrix4().makeRotationX((i * Math.PI) / 3), RIDER.metal);
  [tyre, rim, hub, spoke].forEach((g) => g.dispose());
  return batch.build();
}

function bikeBodyBatch() {
  const b = createBatch();
  const z = RIDER.wheelBase;
  // Frame, engine, tank, seat, mudguards.
  b.box({ x: 0, y: 0.52, z: 0.05, w: 0.16, h: 0.12, d: 1.0, rotY: 0 }, RIDER.paint, PLAIN);
  b.box({ x: 0, y: 0.46, z: -0.02, w: 0.3, h: 0.3, d: 0.42 }, RIDER.metal, PLAIN);
  b.box({ x: 0, y: 0.86, z: 0.18, w: 0.34, h: 0.22, d: 0.5 }, RIDER.paint, PLAIN);
  b.box({ x: 0, y: 0.9, z: -0.3, w: 0.34, h: 0.12, d: 0.62 }, RIDER.seat, PLAIN);
  b.box({ x: 0, y: 0.72, z: -0.62, w: 0.28, h: 0.08, d: 0.7, pitch: -0.2 }, RIDER.paintDark, PLAIN);
  b.box({ x: 0, y: 0.55, z: -z, w: 0.18, h: 0.04, d: 0.5 }, RIDER.paintDark, PLAIN);
  b.box({ x: 0.18, y: 0.28, z: -0.15, w: 0.07, h: 0.07, d: 0.9 }, RIDER.metal, PLAIN);
  // Pegs.
  for (const side of [-1, 1]) b.box({ x: side * 0.22, y: 0.36, z: 0.18, w: 0.12, h: 0.04, d: 0.12 }, RIDER.metal, PLAIN);
  // Rear rack and the delivery box.
  b.box({ x: 0, y: 1.02, z: -0.78, w: 0.46, h: 0.04, d: 0.5 }, RIDER.metal, PLAIN);
  b.box({ x: 0, y: 1.3, z: -0.78, w: 0.54, h: 0.5, d: 0.52 }, RIDER.box, PLAIN);
  b.box({ x: 0, y: 1.57, z: -0.78, w: 0.58, h: 0.06, d: 0.56 }, RIDER.boxBand, PLAIN);
  b.box({ x: 0, y: 1.3, z: -1.045, w: 0.4, h: 0.12, d: 0.02 }, RIDER.boxBand, PLAIN);
  b.box({ x: 0, y: 0.82, z: -1.06, w: 0.2, h: 0.08, d: 0.04 }, RIDER.tail, PLAIN);
  return b;
}

function forkBatch() {
  const b = createBatch();
  const grip = RIDER.grip;
  // Fork legs run from the wheel hub up and back to the handlebar.
  const reach = RIDER.wheelBase - (grip.z - 0.12);
  const rise = grip.y - RIDER.wheelRadius;
  for (const side of [-1, 1]) {
    b.box({
      x: side * 0.1, y: RIDER.wheelRadius + rise / 2, z: RIDER.wheelBase - reach / 2, w: 0.05, h: Math.hypot(reach, rise), d: 0.06, pitch: -Math.atan2(reach, rise),
    }, RIDER.metal, PLAIN);
  }
  b.box({ x: 0, y: grip.y, z: grip.z - 0.12, w: 0.62, h: 0.05, d: 0.05 }, RIDER.metal, PLAIN);
  for (const side of [-1, 1]) b.box({ x: side * grip.x, y: grip.y, z: grip.z - 0.12, w: 0.14, h: 0.06, d: 0.06 }, RIDER.seat, PLAIN);
  b.box({ x: 0, y: 0.98, z: grip.z - 0.14, w: 0.14, h: 0.14, d: 0.12 }, RIDER.headlight, PLAIN);
  b.box({ x: 0, y: 0.68, z: RIDER.wheelBase + 0.02, w: 0.18, h: 0.04, d: 0.5, pitch: 0.12 }, RIDER.paintDark, PLAIN);
  return b;
}

/**
 * @param {{ style: Record<string, string>, reducedMotion: () => boolean }} input
 * @returns {{ group: Group, shadow: Mesh, setStyle: (style: Record<string, string>) => void,
 *   react: (kind: 'hop'|'pump'|'stumble') => void,
 *   update: (frame: { x: number, y: number, z: number, heading: number, steer: number, steerAngle: number,
 *   lean: number, pitch: number, speed: number, dt: number }) => void, dispose: () => void }}
 */
export function createRider({ style, reducedMotion }) {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new Group();
  group.rotation.order = 'YXZ';
  const lean = new Group();
  group.add(lean);
  const meshOf = (geometry) => new Mesh(geometry, material);
  lean.add(meshOf(bikeBodyBatch().build()));

  // The front end steers about the handlebar post, not about the middle of the bike.
  const pivotZ = RIDER.grip.z - 0.12;
  const front = new Group();
  front.position.z = pivotZ;
  const fork = meshOf(forkBatch().build());
  fork.position.z = -pivotZ;
  front.add(fork);
  const frontWheel = meshOf(wheelGeometry());
  frontWheel.position.set(0, RIDER.wheelRadius, RIDER.wheelBase - pivotZ);
  front.add(frontWheel);
  lean.add(front);
  const rearWheel = meshOf(wheelGeometry());
  rearWheel.position.set(0, RIDER.wheelRadius, -RIDER.wheelBase);
  lean.add(rearWheel);

  const rig = new Group();
  lean.add(rig);
  let armMeshes = [];
  function setStyle(next) {
    rig.children.forEach((child) => child.geometry.dispose());
    rig.clear();
    const { body, arms } = buildRiderGeometry(next);
    const bodyMesh = new Mesh(body, material);
    rig.add(bodyMesh);
    armMeshes = arms.map((arm) => {
      const mesh = new Mesh(arm.geometry, material);
      mesh.position.copy(arm.pivot);
      rig.add(mesh);
      return mesh;
    });
  }
  setStyle(style);

  const shadow = new Mesh(
    new CircleGeometry(1, 20),
    new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: RIDER.shadow.opacity, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(RIDER.shadow.width, RIDER.shadow.length, 1);
  shadow.renderOrder = 1;

  // Each beat plays once from its start; a new one replaces the one before.
  const beat = { kind: null, age: 0 };
  function react(kind) {
    beat.kind = kind;
    beat.age = 0;
  }

  // Poses the rider on top of the ride: a crouch with speed, then the current beat.
  function pose(speed, dt) {
    const r = RIDER.react;
    const calm = reducedMotion();
    let hop = 0;
    let pump = 0;
    let tilt = 0;
    let wobble = 0;
    if (beat.kind) {
      beat.age += dt;
      const length = { hop: r.hopSeconds, pump: r.pumpSeconds, stumble: r.stumbleSeconds }[beat.kind];
      const t = beat.age / length;
      if (t >= 1) {
        beat.kind = null;
      } else if (beat.kind === 'hop') {
        hop = calm ? 0 : Math.sin(t * Math.PI) * r.hopHeight;
      } else if (beat.kind === 'pump') {
        pump = Math.sin(t * Math.PI * r.pumpBeats) ** 2 * Math.sin(t * Math.PI) * r.pumpAngle;
      } else if (!calm) {
        tilt = Math.sin(t * Math.PI) * r.stumbleTilt;
        wobble = Math.sin(t * Math.PI * 4) * (1 - t) * r.stumbleWobble;
      }
    }
    rig.position.y = hop;
    rig.rotation.x = r.crouchSpeed * Math.min(1, speed / BIKE.topSpeed) + tilt;
    rig.rotation.z = wobble;
    // Raising an arm turns it about the shoulder; both arms pump together.
    for (const arm of armMeshes) arm.rotation.x = -pump;
  }

  function update({ x, y, z, heading, steerAngle, lean: roll, pitch, speed, dt }) {
    pose(speed, dt);
    group.position.set(x, y, z);
    group.rotation.set(-pitch, heading, 0);
    lean.rotation.z = roll;
    front.rotation.y = -steerAngle;
    const spin = (speed * dt) / RIDER.wheelRadius;
    frontWheel.rotation.x += spin;
    rearWheel.rotation.x += spin;
    shadow.position.set(x, y + RIDER.shadow.lift, z);
    shadow.rotation.set(-Math.PI / 2, 0, -heading);
  }

  function dispose() {
    group.traverse((o) => o.geometry?.dispose());
    material.dispose();
    shadow.geometry.dispose();
    shadow.material.dispose();
  }
  return { group, shadow, setStyle, react, update, dispose };
}
