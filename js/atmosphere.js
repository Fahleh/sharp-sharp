// Sets the sky, fog and lights each frame from the weather. It only draws what the sim says.

import { Color } from 'three';
import { LIGHTS, LOOK, SKY, WEATHER } from './config.js';

/**
 * @param {{ scene: import('three').Scene, sky: ReturnType<typeof import('./sky.js').createSky>,
 *   sun: import('three').DirectionalLight, hemi: import('three').HemisphereLight,
 *   wetLook: ReturnType<typeof import('./wetlook.js').createWetLook> }} parts
 * @returns {{ update: (frame: { rain: number, wet: number }) => void }}
 */
export function createAtmosphere({ scene, sky, sun, hemi, wetLook }) {
  const dry = { horizon: new Color(SKY.horizon), mid: new Color(SKY.mid), zenith: new Color(SKY.zenith) };
  const grey = { horizon: new Color(WEATHER.skyHorizon), mid: new Color(WEATHER.skyMid), zenith: new Color(WEATHER.skyZenith) };
  const fogDry = new Color(LOOK.horizon);
  const fogGrey = new Color(WEATHER.fogHorizon);
  const colors = { horizon: new Color(), mid: new Color(), zenith: new Color() };
  const mix = (a, b, t) => a + (b - a) * t;

  function update({ rain, wet }) {
    for (const key of ['horizon', 'mid', 'zenith']) colors[key].copy(dry[key]).lerp(grey[key], rain);
    sky.setColors(colors, 1 - rain);
    scene.background.copy(fogDry).lerp(fogGrey, rain);
    scene.fog.color.copy(scene.background);
    scene.fog.near = LOOK.fogNear * mix(1, WEATHER.fogNearScale, rain);
    scene.fog.far = LOOK.fogFar * mix(1, WEATHER.fogFarScale, rain);
    const light = mix(1, WEATHER.lightScale, rain);
    sun.intensity = LIGHTS.dirIntensity * light;
    hemi.intensity = LIGHTS.hemiIntensity * light;
    wetLook.uniforms.uWet.value = wet;
    wetLook.uniforms.uSheen.value.copy(scene.background);
  }

  return { update };
}
