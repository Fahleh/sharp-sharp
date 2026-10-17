// Builds every static mesh of the district from the map and the generated city, in chunks so
// culling works and the draw-call count stays small. Reads the sim data, decides no rules.

import {
  Group, Mesh, MeshLambertMaterial, PlaneGeometry, RepeatWrapping,
} from 'three';
import { KERB_HEIGHT, LOOK, PROP_LOOK as L } from './config.js';
import { createBatch } from './batch.js';
import { addBuilding, addSigns } from './buildingmesh.js';
import { buildGround } from './groundmesh.js';
import { addProp } from './propmesh.js';
import { createFacadeTexture, createRippleTexture, createSignAtlas } from './textures.js';

const PLAIN = { u: 0.04, v: 0.04 };

function makeChunks(world) {
  const chunks = [];
  for (let z0 = world.z0; z0 < world.z1; z0 += LOOK.chunk) {
    for (let x0 = world.x0; x0 < world.x1; x0 += LOOK.chunk) {
      chunks.push({
        x0, z0, x1: Math.min(x0 + LOOK.chunk, world.x1), z1: Math.min(z0 + LOOK.chunk, world.z1),
        batch: createBatch(), buildings: createBatch(),
      });
    }
  }
  return chunks;
}

const chunkAt = (chunks, x, z) => chunks.find((c) => x >= c.x0 && x < c.x1 && z >= c.z0 && z < c.z1) ?? chunks[0];

function addBridge(batch, map) {
  const { graph, bridge } = map;
  const x0 = graph.nodes.get(bridge.from).x + 4;
  const x1 = graph.nodes.get(bridge.to).x - 4;
  const zc = graph.nodes.get(bridge.from).z;
  const hw = 7;
  const edge = bridge.deckHalfWidth;
  const rise = (x) => bridge.height * Math.sin((Math.PI * (x - x0)) / (x1 - x0));
  const step = 2;
  const girder = 0.9;
  for (let xa = x0; xa < x1 - 1e-6; xa += step) {
    const xb = Math.min(x1, xa + step);
    const ya = rise(xa);
    const yb = rise(xb);
    const strip = (za, zb, lift, color) => batch.face([xa, ya + lift, za], [xa, ya + lift, zb], [xb, yb + lift, zb], [xb, yb + lift, za], color);
    strip(zc - hw, zc + hw, LOOK.roadY, LOOK.road);
    strip(zc - edge, zc - hw, KERB_HEIGHT, LOOK.sidewalk);
    strip(zc + hw, zc + edge, KERB_HEIGHT, LOOK.sidewalk);
    // Girder sides, seen from outside.
    batch.face([xb, yb - girder, zc - edge], [xa, ya - girder, zc - edge], [xa, ya + KERB_HEIGHT, zc - edge], [xb, yb + KERB_HEIGHT, zc - edge], LOOK.bridgeDeck);
    batch.face([xa, ya - girder, zc + edge], [xb, yb - girder, zc + edge], [xb, yb + KERB_HEIGHT, zc + edge], [xa, ya + KERB_HEIGHT, zc + edge], LOOK.bridgeDeck);
    const slope = Math.atan2(yb - ya, xb - xa);
    for (const side of [-1, 1]) {
      batch.box({
        x: (xa + xb) / 2, y: (ya + yb) / 2 + KERB_HEIGHT + 0.5, z: zc + side * (edge - 0.3), w: 0.5, h: 0.14, d: Math.hypot(xb - xa, yb - ya) + 0.02, rotY: Math.PI / 2, pitch: -slope,
      }, LOOK.bridgeRail, PLAIN);
    }
  }
  for (let x = x0; x <= x1; x += 8) {
    for (const side of [-1, 1]) batch.box({ x, y: rise(x) + KERB_HEIGHT + 0.25, z: zc + side * (edge - 0.3), w: 0.4, h: 0.9, d: 0.4 }, LOOK.bridgeRail, PLAIN);
  }
  for (const x of [x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.5, x0 + (x1 - x0) * 0.75]) {
    const top = rise(x) - girder;
    batch.box({ x, y: (top - 0.6) / 2 - 0.3, z: zc, w: 2.6, h: top + 0.6, d: edge * 2 - 1 }, LOOK.pier, PLAIN);
  }
}

function addFar(batch, city, map) {
  for (const wall of city.walls) {
    batch.box({ x: wall.x, y: 1.6, z: wall.z, w: wall.hw * 2, h: 3.2, d: wall.hd * 2 }, LOOK.wall, PLAIN);
    batch.box({ x: wall.x, y: 2.9, z: wall.z, w: wall.hw * 2 + 0.05, h: 0.5, d: wall.hd * 2 + 0.05 }, LOOK.wallStripe, PLAIN);
  }
  for (const b of city.skyline) batch.box({ x: b.x, y: b.h / 2, z: b.z, w: b.w, h: b.h, d: b.d }, b.color, PLAIN);
  for (const boat of city.boats) {
    batch.box({ x: boat.x, y: 0.15, z: boat.z, w: 1.7, h: 0.6, d: boat.length, rotY: boat.rot }, boat.color, PLAIN);
    batch.box({ x: boat.x, y: 0.5, z: boat.z, w: 1.5, h: 0.1, d: boat.length - 0.4, rotY: boat.rot }, L.boatDeck, PLAIN);
    if (boat.cabin) {
      batch.box({ x: boat.x, y: 1.1, z: boat.z + Math.cos(boat.rot) * -boat.length * 0.15, w: 1.2, h: 1, d: boat.length * 0.35, rotY: boat.rot }, L.boatCabin, PLAIN);
    }
    batch.box({ x: boat.x + Math.sin(boat.rot) * boat.length * 0.25, y: 1.4, z: boat.z + Math.cos(boat.rot) * boat.length * 0.25, w: 0.1, h: 2.2, d: 0.1 }, L.frame, PLAIN);
  }
  const { x, z, island } = map.roundabout;
  batch.cylinder({ x, y: KERB_HEIGHT + 0.7, z, r: 1.6, h: 1.1 }, L.monument, PLAIN);
  batch.cone({ x, y: KERB_HEIGHT + 5, z, r: 1.2, h: 7 }, L.monument, PLAIN);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    addProp(batch, { kind: 'palm', x: x + Math.sin(a) * (island - 4), z: z + Math.cos(a) * (island - 4), rot: i });
  }
}

/**
 * @param {{ terrain: object, city: object, map: object, maxAnisotropy: number }} input
 * @returns {{ group: Group, update: (seconds: number) => void, dispose: () => void }}
 */
export function createWorld({ terrain, city, map, maxAnisotropy, wetLook }) {
  const chunks = makeChunks(map.world);
  buildGround({ terrain, chunks, map, city });
  for (const prop of city.props) addProp(chunkAt(chunks, prop.x, prop.z).batch, prop);
  for (const b of city.buildings) addBuilding(chunkAt(chunks, b.x, b.z).buildings, b);
  const bridge = createBatch();
  addBridge(bridge, map);
  const far = createBatch();
  addFar(far, city, map);
  const signs = createBatch();
  const atlas = createSignAtlas(city.signs);
  addSigns(signs, city.signs, atlas);

  const flat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const facade = createFacadeTexture(maxAnisotropy);
  const textured = new MeshLambertMaterial({ vertexColors: true, map: facade, flatShading: true });
  const signMaterial = new MeshLambertMaterial({ vertexColors: true, map: atlas.texture });
  wetLook.apply(flat);
  wetLook.apply(textured);
  const group = new Group();
  const geometries = [];
  const addMesh = (batch, material) => {
    const geometry = batch.build();
    if (!geometry) return;
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  };
  for (const chunk of chunks) {
    addMesh(chunk.batch, flat);
    addMesh(chunk.buildings, textured);
  }
  addMesh(bridge, flat);
  addMesh(far, flat);
  addMesh(signs, signMaterial);

  // Water: one plane for the lagoon, one for the inlet, with slowly drifting ripples.
  const ripple = createRippleTexture();
  const waterMaterials = [];
  const waterPlane = ({ x0, x1, z0, z1 }) => {
    const texture = ripple.clone();
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set((x1 - x0) / LOOK.rippleRepeat, (z1 - z0) / LOOK.rippleRepeat);
    texture.needsUpdate = true;
    const material = new MeshLambertMaterial({ color: LOOK.water, map: texture });
    waterMaterials.push(material);
    const geometry = new PlaneGeometry(x1 - x0, z1 - z0);
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, LOOK.waterY, (z0 + z1) / 2);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  };
  const span = LOOK.horizonSpan;
  waterPlane({ x0: -span, x1: span, z0: -span, z1: map.water.lagoon.z1 });
  waterPlane(map.water.inlet);

  // Everything south of the shoreline rests on this base, so no seam shows past the district.
  const baseGeometry = new PlaneGeometry(span * 2, span * 2 + map.water.lagoon.z1);
  geometries.push(baseGeometry);
  const baseMaterial = new MeshLambertMaterial({ color: LOOK.ground });
  const base = new Mesh(baseGeometry, baseMaterial);
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, -0.1, (map.water.lagoon.z1 + span) / 2);
  base.matrixAutoUpdate = false;
  base.updateMatrix();
  group.add(base);

  function update(seconds) {
    for (const material of waterMaterials) {
      material.map.offset.set(seconds * LOOK.rippleSpeed, seconds * LOOK.rippleSpeed * 0.6);
    }
  }

  function dispose() {
    geometries.forEach((g) => g.dispose());
    [flat, textured, signMaterial, baseMaterial, ...waterMaterials].forEach((m) => { m.map?.dispose(); m.dispose(); });
    ripple.dispose();
  }

  return { group, update, dispose };
}
