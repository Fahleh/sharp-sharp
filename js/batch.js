// Collects many small shapes into one vertex-coloured geometry, so a whole district chunk
// costs one draw call. Shapes are transformed and copied in, nothing is kept alive.

import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Matrix3, Matrix4,
  SphereGeometry, Vector3,
} from 'three';

const prefabs = {
  box: new BoxGeometry(1, 1, 1),
  // Open at the bottom: nothing ever sees the underside of a prop.
  cone: new ConeGeometry(1, 1, 8, 1, true),
  cylinder: new CylinderGeometry(1, 1, 1, 8, 1),
  sphere: new SphereGeometry(1, 8, 6),
};

const point = new Vector3();
const normal = new Vector3();
const scratch = new Color();
const place = new Matrix4();
const turn = new Matrix4();
const scale = new Matrix4();
const tilt = new Matrix4();
const edgeA = new Vector3();
const edgeB = new Vector3();
const normalMatrix = new Matrix3();

/**
 * @returns {{ add: Function, box: Function, cylinder: Function, cone: Function, sphere: Function,
 *   quad: Function, build: () => BufferGeometry|null, count: number }}
 */
export function createBatch() {
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];

  function push(x, y, z, nx, ny, nz, color, u, v) {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    colors.push(color.r, color.g, color.b);
    uvs.push(u, v);
  }

  /**
   * Copy a geometry in through `matrix`.
   * @param {BufferGeometry} geometry
   * @param {Matrix4} matrix
   * @param {string} hex vertex colour
   * @param {{ u?: number, v?: number }} [uv] when given, every vertex gets this single texture coordinate
   */
  function add(geometry, matrix, hex, uv) {
    scratch.set(hex);
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const tex = geometry.attributes.uv;
    const index = geometry.index;
    const count = index ? index.count : pos.count;
    normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < count; i += 1) {
      const v = index ? index.getX(i) : i;
      point.fromBufferAttribute(pos, v).applyMatrix4(matrix);
      normal.fromBufferAttribute(nor, v).applyNormalMatrix(normalMatrix).normalize();
      push(point.x, point.y, point.z, normal.x, normal.y, normal.z, scratch, uv ? uv.u : tex.getX(v), uv ? uv.v : tex.getY(v));
    }
  }

  // Place a unit prefab: scaled to size, turned about y, centred at (x, y, z).
  function shape(prefab, { x, y, z, sx, sy, sz, rotY = 0, pitch = 0 }, hex, uv) {
    place.makeTranslation(x, y, z);
    turn.makeRotationY(rotY);
    place.multiply(turn);
    if (pitch !== 0) place.multiply(tilt.makeRotationX(pitch));
    scale.makeScale(sx, sy, sz);
    place.multiply(scale);
    add(prefabs[prefab], place, hex, uv);
  }

  return {
    add,
    /** A box with its centre at (x, y, z); `pitch` tips its far end down (positive) about its local x axis. */
    box: ({ x, y, z, w, h, d, rotY, pitch }, hex, uv) => shape('box', { x, y, z, sx: w, sy: h, sz: d, rotY, pitch }, hex, uv),
    /** A cylinder or truncated cone standing on y, centred at (x, y, z). */
    cylinder: ({ x, y, z, r, h, rotY }, hex, uv) => shape('cylinder', { x, y, z, sx: r, sy: h, sz: r, rotY }, hex, uv),
    cone: ({ x, y, z, r, h, rotY }, hex, uv) => shape('cone', { x, y, z, sx: r, sy: h, sz: r, rotY }, hex, uv),
    sphere: ({ x, y, z, rx, ry, rz, rotY }, hex, uv) => shape('sphere', { x, y, z, sx: rx, sy: ry ?? rx, sz: rz ?? rx, rotY }, hex, uv),
    /** A flat, upward-facing disc on the ground plane. */
    disc(x, z, r, y, hex, segments = 40) {
      scratch.set(hex);
      for (let i = 0; i < segments; i += 1) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        push(x, y, z, 0, 1, 0, scratch, 0, 0);
        push(x + Math.sin(a0) * r, y, z + Math.cos(a0) * r, 0, 1, 0, scratch, 0, 0);
        push(x + Math.sin(a1) * r, y, z + Math.cos(a1) * r, 0, 1, 0, scratch, 0, 0);
      }
    },
    /** A flat, upward-facing ring between radii r0 and r1. */
    ring(x, z, r0, r1, y, hex, segments = 48) {
      scratch.set(hex);
      for (let i = 0; i < segments; i += 1) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const p = (a, r) => [x + Math.sin(a) * r, z + Math.cos(a) * r];
        const [ax, az] = p(a0, r0);
        const [bx, bz] = p(a0, r1);
        const [cx, cz] = p(a1, r1);
        const [dx, dz] = p(a1, r0);
        push(ax, y, az, 0, 1, 0, scratch, 0, 0); push(bx, y, bz, 0, 1, 0, scratch, 0, 0); push(cx, y, cz, 0, 1, 0, scratch, 0, 0);
        push(ax, y, az, 0, 1, 0, scratch, 0, 0); push(cx, y, cz, 0, 1, 0, scratch, 0, 0); push(dx, y, dz, 0, 1, 0, scratch, 0, 0);
      }
    },
    /** Any four-cornered face, given counter-clockwise as seen from the front. */
    face(p0, p1, p2, p3, hex, uv = { u: 0, v: 0 }) {
      scratch.set(hex);
      edgeA.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      edgeB.set(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
      normal.crossVectors(edgeA, edgeB).normalize();
      for (const p of [p0, p1, p2, p0, p2, p3]) push(p[0], p[1], p[2], normal.x, normal.y, normal.z, scratch, uv.u, uv.v);
    },
    /** A flat, upward-facing rectangle on the ground plane. */
    quad(x0, z0, x1, z1, y, hex, uv = { u: 0, v: 0 }) {
      scratch.set(hex);
      push(x0, y, z0, 0, 1, 0, scratch, uv.u, uv.v);
      push(x0, y, z1, 0, 1, 0, scratch, uv.u, uv.v);
      push(x1, y, z1, 0, 1, 0, scratch, uv.u, uv.v);
      push(x0, y, z0, 0, 1, 0, scratch, uv.u, uv.v);
      push(x1, y, z1, 0, 1, 0, scratch, uv.u, uv.v);
      push(x1, y, z0, 0, 1, 0, scratch, uv.u, uv.v);
    },
    /** A rectangle standing upright, facing `rotY` (its normal is (sin, cos)), centred at (x, y, z). */
    panel({ x, y, z, w, h, rotY }, hex, rect) {
      scratch.set(hex);
      const sin = Math.sin(rotY);
      const cos = Math.cos(rotY);
      // Local x axis is (cos, -sin) in the ground plane.
      const ax = (cos * w) / 2;
      const az = (-sin * w) / 2;
      const top = y + h / 2;
      const bottom = y - h / 2;
      const corner = (sx, yy, u, v) => push(x + sx * ax, yy, z + sx * az, sin, 0, cos, scratch, u, v);
      const { u0, v0, u1, v1 } = rect;
      corner(-1, bottom, u0, v0); corner(1, bottom, u1, v0); corner(1, top, u1, v1);
      corner(-1, bottom, u0, v0); corner(1, top, u1, v1); corner(-1, top, u0, v1);
    },
    build() {
      if (positions.length === 0) return null;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      geometry.computeBoundingSphere();
      return geometry;
    },
    get count() { return positions.length / 3; },
  };
}
