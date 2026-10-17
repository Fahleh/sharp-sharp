// Sky dome: a gradient drawn in screen space so the horizon band stays visible at any camera
// pitch, plus a low sun. Adapted from Dusk Stack, without the stars.

import {
  BackSide, Mesh, ShaderMaterial, SphereGeometry, Vector2, Vector3,
} from 'three';
import { SKY } from './config.js';

const VERTEX = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uMid;
uniform vec3 uZenith;
uniform vec2 uRes;
uniform vec2 uSun;
uniform float uHorizonAt;
uniform float uZenithAt;
uniform float uSunStrength;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float g = smoothstep(uHorizonAt, uZenithAt, uv.y);
  vec3 col = mix(mix(uHorizon, uMid, smoothstep(0.0, 0.55, g)), uZenith, smoothstep(0.45, 1.0, g));
  float sd = length((uv - uSun) * vec2(uRes.x / uRes.y, 1.0));
  col += vec3(1.0, 0.82, 0.55) * (exp(-sd * 4.0) * 0.45 + smoothstep(0.075, 0.06, sd) * 0.85) * uSunStrength;
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * @returns {{ mesh: Mesh, resize: (size: { width: number, height: number }) => void,
 *   setColors: (colors: { horizon: import('three').Color, mid: import('three').Color, zenith: import('three').Color },
 *   sunStrength: number) => void,
 *   follow: (position: Vector3) => void, dispose: () => void }}
 */
export function createSky() {
  const geometry = new SphereGeometry(SKY.radius, 24, 12);
  const colour = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new Vector3(r, g, b);
  };
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uHorizon: { value: colour(SKY.horizon) },
      uMid: { value: colour(SKY.mid) },
      uZenith: { value: colour(SKY.zenith) },
      uRes: { value: new Vector2(1, 1) },
      uSun: { value: new Vector2(...SKY.sun) },
      uHorizonAt: { value: SKY.horizonAt },
      uZenithAt: { value: SKY.zenithAt },
      uSunStrength: { value: 1 },
    },
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    resize: ({ width, height }) => material.uniforms.uRes.value.set(width, height),
    setColors({ horizon, mid, zenith }, sunStrength) {
      material.uniforms.uSunStrength.value = sunStrength;
      material.uniforms.uHorizon.value.set(horizon.r, horizon.g, horizon.b);
      material.uniforms.uMid.value.set(mid.r, mid.g, mid.b);
      material.uniforms.uZenith.value.set(zenith.r, zenith.g, zenith.b);
    },
    follow: (position) => mesh.position.copy(position),
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
