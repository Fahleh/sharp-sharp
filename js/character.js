// The player's start.ng character, built from boxes and spheres into three merged geometries:
// the body (legs, torso, head, hair, hat, accessory) and one per arm. Seated on the bike,
// facing +z. Adapted from Dusk Stack's figure builder, with the pose changed to riding.

import {
  BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, SphereGeometry,
  TorusGeometry, Vector3,
} from 'three';
import { createBatch } from './batch.js';
import { CHARACTER as C, RIDER } from './config.js';

// Model dimensions (not gameplay tunables), in figure units before RIDER.scale is applied.
const SHAPE = Object.freeze({
  hairCap: 1.12, hairCapReach: Math.PI * 0.55,
  afroRadius: 0.24, afroLift: 0.11, afroBack: 0.075, afroUnderHat: 0.85,
  strandRadius: 0.016, braidLength: 0.27, braidCount: 6, braidArc: 1.3,
  dreadLength: 0.34, dreadCount: 10, dreadArc: 1.75, dreadRadius: 0.021,
  bunRadius: 0.08, ponytailRadius: 0.035, ponytailLength: 0.2, ponytailTilt: -0.6,
  eyeRadius: 0.027, pupilRadius: 0.015, pupilForward: 0.018, eyeSpread: 0.058, eyeForward: 0.15,
  hatLiftAfroSmall: 0.09, hatLiftAfroTall: 0.14, domeScale: 1.12, beanieScale: 1.18, beanieReach: Math.PI * 0.6,
  brimRadius: 0.17, brimThickness: 0.014, brimForward: 0.05, pomRadius: 0.04,
  topHatHeight: 0.26, topHatRadius: 0.145, topHatBrim: 0.25,
  crownRadius: 0.165, crownHeight: 0.1, crownPoints: 5, crownPointRadius: 0.03, crownPointHeight: 0.1,
  glassesRadius: 0.045, glassesTube: 0.008, glassesSpread: 0.06, earringRadius: 0.02, beardScale: 0.78,
  scarfRadius: 0.1, scarfTube: 0.035, packWidth: 0.26, packHeight: 0.3, packDepth: 0.1, neckRadius: 0.05,
  thigh: 0.3, shin: 0.3, footLength: 0.2, hipGap: 0.1,
  torsoLean: RIDER.lean,
});

const COVERED_BY_HAT = new Set(['cap', 'beanie']);

/**
 * @param {Record<string, string>} style a normalized style
 * @returns {{ body: import('three').BufferGeometry|null, arms: Array<{ geometry: import('three').BufferGeometry|null, pivot: Vector3, side: number }> }}
 */
export function buildRiderGeometry(style) {
  const batch = createBatch();
  const female = style.body === 'female';
  const torsoWidth = female ? C.torsoWidthFemale : C.torsoWidthMale;
  const R = C.headRadius;
  const seg = C.segments;
  const neckY = C.torsoHeight;
  const headY = neckY + C.neckGap + R;

  const lift = new Matrix4();
  const scratch = new Matrix4();
  const quat = new Quaternion();
  const euler = new Euler();
  // Everything is modelled with the hips at the origin, then placed on the seat.
  const seat = new Matrix4().makeTranslation(0, RIDER.seatY, RIDER.seatZ).multiply(new Matrix4().makeScale(RIDER.scale, RIDER.scale, RIDER.scale));
  const upper = new Matrix4().copy(seat).multiply(new Matrix4().makeRotationX(SHAPE.torsoLean));

  function part(geometry, hex, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, base = upper } = {}) {
    euler.set(rx, ry, rz);
    quat.setFromEuler(euler);
    scratch.compose(new Vector3(x, y, z), quat, new Vector3(sx, sy, sz));
    lift.copy(base).multiply(scratch);
    batch.add(geometry, lift, hex);
    geometry.dispose();
  }

  // ---- legs: thigh forward, shin down to the foot peg
  const legX = (C.legWidth + SHAPE.hipGap) / 2;
  const legColor = female ? style.skinColor : style.secondaryColor;
  for (const side of [-1, 1]) {
    part(new BoxGeometry(C.legWidth, C.legWidth, SHAPE.thigh), legColor, { x: side * legX, y: 0.02, z: SHAPE.thigh / 2, base: seat });
    part(new BoxGeometry(C.legWidth * 0.92, SHAPE.shin, C.legWidth * 0.92), legColor, { x: side * legX, y: -SHAPE.shin / 2 + 0.07, z: SHAPE.thigh - 0.03, rx: -0.15, base: seat });
    part(new BoxGeometry(C.legWidth, 0.05, SHAPE.footLength), C.shoe, { x: side * legX, y: -SHAPE.shin + 0.03, z: SHAPE.thigh + 0.04, base: seat });
  }
  if (female) {
    part(new CylinderGeometry(C.skirtTop, C.skirtBottom * 0.9, 0.18, seg), style.secondaryColor, { y: 0.02, base: seat });
  } else {
    part(new BoxGeometry(torsoWidth * 0.95, C.legWidth, 0.3), style.secondaryColor, { y: 0.0, z: 0.0, base: seat });
  }

  // ---- torso, neck, head
  part(new BoxGeometry(torsoWidth, C.torsoHeight, C.torsoDepth), style.primaryColor, { y: C.torsoHeight / 2 + 0.03 });
  part(new CylinderGeometry(SHAPE.neckRadius, SHAPE.neckRadius, 0.06, seg), style.skinColor, { y: neckY + 0.04 });
  part(new SphereGeometry(R, 10, 8), style.skinColor, { y: headY + 0.03 });
  for (const side of [-1, 1]) {
    const eye = { x: side * SHAPE.eyeSpread, y: headY + 0.04, z: SHAPE.eyeForward };
    part(new SphereGeometry(SHAPE.eyeRadius, 6, 5), C.eyeWhite, eye);
    part(new SphereGeometry(SHAPE.pupilRadius, 6, 5), C.eye, { ...eye, z: eye.z + SHAPE.pupilForward });
  }

  // ---- hair
  const hy = headY + 0.03;
  const hatCovers = COVERED_BY_HAT.has(style.hat);
  const hairCap = () => part(
    new SphereGeometry(R * SHAPE.hairCap, 10, 8, 0, Math.PI * 2, 0, SHAPE.hairCapReach), style.hairColor,
    { y: hy + 0.01, z: -0.012, rx: -0.25 },
  );
  const strands = ({ count, arc, length, radius, drop }) => {
    for (let i = 0; i < count; i += 1) {
      const angle = count === 1 ? 0 : -arc + (2 * arc * i) / (count - 1);
      part(new CylinderGeometry(radius, radius, length, 5), style.hairColor, {
        x: Math.sin(angle) * R * 0.95, y: hy - drop - length / 2 + 0.1, z: -Math.cos(angle) * R * 0.95,
      });
    }
  };
  let hatLift = 0;
  switch (style.hair) {
    case 'short':
      if (!hatCovers) hairCap();
      break;
    case 'afro': {
      const k = hatCovers ? SHAPE.afroUnderHat : 1;
      part(new SphereGeometry(SHAPE.afroRadius, 10, 8), style.hairColor, { y: hy + SHAPE.afroLift, z: -SHAPE.afroBack, sx: k, sy: k, sz: k });
      hatLift = hatCovers ? SHAPE.hatLiftAfroSmall : SHAPE.hatLiftAfroTall;
      break;
    }
    case 'braids':
      if (!hatCovers) hairCap();
      strands({ count: SHAPE.braidCount, arc: SHAPE.braidArc, length: SHAPE.braidLength, radius: SHAPE.strandRadius, drop: 0.08 });
      break;
    case 'bun':
      if (!hatCovers) {
        hairCap();
        part(new SphereGeometry(SHAPE.bunRadius, 8, 6), style.hairColor, { y: hy + R * 1.1 + 0.04, z: -0.03 });
      }
      break;
    case 'ponytail':
      if (!hatCovers) hairCap();
      part(new CapsuleGeometry(SHAPE.ponytailRadius, SHAPE.ponytailLength, 3, 6), style.hairColor, { y: hy - 0.02, z: -R - 0.05, rx: SHAPE.ponytailTilt });
      break;
    case 'dreads':
      if (!hatCovers) hairCap();
      strands({ count: SHAPE.dreadCount, arc: SHAPE.dreadArc, length: SHAPE.dreadLength, radius: SHAPE.dreadRadius, drop: 0.05 });
      break;
    default:
      break; // bald
  }

  // ---- hat (no helmet: the hat stays)
  const hatY = hy + hatLift;
  switch (style.hat) {
    case 'cap':
      part(new SphereGeometry(R * SHAPE.domeScale, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), style.primaryColor, { y: hatY + 0.02 });
      part(new CylinderGeometry(SHAPE.brimRadius, SHAPE.brimRadius, SHAPE.brimThickness, 10, 1, false, -Math.PI / 2, Math.PI), style.primaryColor, { y: hatY + 0.075, z: SHAPE.brimForward });
      break;
    case 'beanie':
      part(new SphereGeometry(R * SHAPE.beanieScale, 10, 8, 0, Math.PI * 2, 0, SHAPE.beanieReach), style.primaryColor, { y: hatY + 0.015 });
      part(new SphereGeometry(SHAPE.pomRadius, 8, 6), style.secondaryColor, { y: hatY + R * SHAPE.beanieScale + 0.01 });
      break;
    case 'tophat': {
      const brimY = hatY + R * 0.88;
      part(new CylinderGeometry(SHAPE.topHatBrim, SHAPE.topHatBrim, 0.025, 12), C.hatDark, { y: brimY });
      part(new CylinderGeometry(SHAPE.topHatRadius, SHAPE.topHatRadius + 0.01, SHAPE.topHatHeight, 10), C.hatDark, { y: brimY + SHAPE.topHatHeight / 2 });
      part(new CylinderGeometry(SHAPE.topHatRadius + 0.012, SHAPE.topHatRadius + 0.016, 0.045, 10), style.primaryColor, { y: brimY + 0.04 });
      break;
    }
    case 'crown': {
      const baseY = hatY + R * 0.85 + SHAPE.crownHeight / 2;
      part(new CylinderGeometry(SHAPE.crownRadius, SHAPE.crownRadius + 0.01, SHAPE.crownHeight, 10, 1, true), C.gold, { y: baseY });
      for (let i = 0; i < SHAPE.crownPoints; i += 1) {
        const angle = (i / SHAPE.crownPoints) * Math.PI * 2;
        part(new ConeGeometry(SHAPE.crownPointRadius, SHAPE.crownPointHeight, 4), C.gold, {
          x: Math.sin(angle) * SHAPE.crownRadius, y: baseY + SHAPE.crownHeight / 2 + SHAPE.crownPointHeight / 2 - 0.01, z: Math.cos(angle) * SHAPE.crownRadius,
        });
      }
      break;
    }
    default:
      break;
  }

  // ---- accessory
  switch (style.accessory) {
    case 'glasses':
      for (const side of [-1, 1]) {
        part(new TorusGeometry(SHAPE.glassesRadius, SHAPE.glassesTube, 6, 12), C.hatDark, { x: side * SHAPE.glassesSpread, y: hy + 0.01, z: R - 0.005 });
      }
      part(new BoxGeometry(SHAPE.glassesSpread, SHAPE.glassesTube, SHAPE.glassesTube), C.hatDark, { y: hy + 0.02, z: R });
      break;
    case 'earrings':
      for (const side of [-1, 1]) part(new SphereGeometry(SHAPE.earringRadius, 6, 5), C.gold, { x: side * (R + 0.005), y: hy - 0.03 });
      break;
    case 'beard':
      part(new SphereGeometry(R * SHAPE.beardScale, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), style.hairColor, { y: hy - 0.05, z: 0.05, sx: 1.05, sy: 1.15 });
      break;
    case 'scarf':
      part(new TorusGeometry(SHAPE.scarfRadius, SHAPE.scarfTube, 6, 10), style.secondaryColor, { y: neckY + 0.04, rx: Math.PI / 2 });
      part(new BoxGeometry(0.06, 0.16, 0.03), style.secondaryColor, { x: 0.06, y: neckY - 0.05, z: SHAPE.scarfRadius + 0.02 });
      break;
    case 'backpack':
      // Worn on the back, in front of the delivery box on the rack.
      part(new BoxGeometry(SHAPE.packWidth, SHAPE.packHeight, SHAPE.packDepth), style.secondaryColor, { y: C.torsoHeight / 2 + 0.04, z: -(C.torsoDepth / 2 + SHAPE.packDepth / 2) });
      break;
    default:
      break;
  }

  // ---- arms: one geometry each, hanging from the shoulder pivot toward the handlebar grip
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = createBatch();
    const shoulder = new Vector3(side * (torsoWidth / 2 + C.armWidth / 2), C.torsoHeight, 0).applyMatrix4(upper);
    const hand = new Vector3(side * RIDER.grip.x, RIDER.grip.y, RIDER.grip.z);
    const along = hand.clone().sub(shoulder);
    const length = along.length();
    const pitch = Math.atan2(-along.y, along.z);
    const place = new Matrix4().makeTranslation(along.x / 2, along.y / 2, along.z / 2).multiply(new Matrix4().makeRotationX(pitch));
    const upperLength = length * 0.5;
    const mid = (offset) => new Matrix4().copy(place).multiply(new Matrix4().makeTranslation(0, 0, offset));
    arm.add(new BoxGeometry(C.armWidth + 0.012, C.armWidth + 0.012, upperLength), mid(-upperLength / 2), style.primaryColor);
    arm.add(new BoxGeometry(C.armWidth, C.armWidth, length - upperLength), mid(upperLength / 2), style.skinColor);
    arms.push({ geometry: arm.build(), pivot: shoulder, side });
  }
  return { body: batch.build(), arms };
}
