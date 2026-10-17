// The wet-road look: wet surfaces go darker and up-facing ones catch a sheen of sky, faked in
// the Lambert shader. The chunk names (`common`, `color_fragment`, `opaque_fragment`) and the
// `normal` and `vViewPosition` names are the ones in vendor/three.module.js's Lambert fragment.

import { Color } from 'three';
import { WEATHER } from './config.js';

/**
 * @returns {{ uniforms: { uWet: { value: number }, uSheen: { value: Color } },
 *   apply: (material: import('three').Material) => void }}
 */
export function createWetLook() {
  const uniforms = {
    uWet: { value: 0 },
    uSheen: { value: new Color(WEATHER.sheenColor) },
    uDarken: { value: WEATHER.wetDarken },
    uSheenAmount: { value: WEATHER.wetSheen },
  };
  return {
    uniforms,
    /** Make a Lambert material react to `uWet`. Call before its first render. */
    apply(material) {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float uWet;
uniform vec3 uSheen;
uniform float uDarken;
uniform float uSheenAmount;`)
          .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 1.0 - uDarken * uWet;`)
          .replace('#include <opaque_fragment>', `
{
  vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float facing = smoothstep(0.9, 1.0, dot(normal, upView));
  float fresnel = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
  outgoingLight += uSheen * (uWet * uSheenAmount * facing * (0.15 + fresnel));
}
#include <opaque_fragment>`);
      };
    },
  };
}
