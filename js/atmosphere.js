// Sets the sky, fog and lights each frame from the time of day and the weather. It only draws
// what the sim says. Sky colours are passed to its shader as written (sRGB); scene colours go
// through three.js's colour management.

import { SRGBColorSpace } from 'three';
import { LOOK, WEATHER } from './config.js';
import { daylightAt, hexToRgb, lightsGlow } from './daylight.js';

const mix = (a, b, t) => a + (b - a) * t;

/**
 * @param {{ scene: import('three').Scene, sky: ReturnType<typeof import('./sky.js').createSky>,
 *   sun: import('three').DirectionalLight, hemi: import('three').HemisphereLight,
 *   wetLook: ReturnType<typeof import('./wetlook.js').createWetLook> }} parts
 * @returns {{ update: (frame: { progress: number, rain: number, wet: number }) => number }} `update`
 *   returns how bright the lamps and headlights should be, 0 to 1
 */
export function createAtmosphere({ scene, sky, sun, hemi, wetLook }) {
  const grey = {
    horizon: hexToRgb(WEATHER.skyHorizon), mid: hexToRgb(WEATHER.skyMid), zenith: hexToRgb(WEATHER.skyZenith), fog: hexToRgb(WEATHER.fogHorizon),
  };
  const sky3 = { horizon: { r: 0, g: 0, b: 0 }, mid: { r: 0, g: 0, b: 0 }, zenith: { r: 0, g: 0, b: 0 } };
  const fog = { r: 0, g: 0, b: 0 };

  // Rain pulls a colour toward its grey, darker as the day fades.
  const blend = (out, day, rainy, shade, rain) => {
    out.r = mix(day.r, rainy.r * shade, rain);
    out.g = mix(day.g, rainy.g * shade, rain);
    out.b = mix(day.b, rainy.b * shade, rain);
  };

  function update({ progress, rain, wet }) {
    const d = daylightAt(progress);
    for (const key of ['horizon', 'mid', 'zenith']) blend(sky3[key], d[key], grey[key], d.shade, rain);
    sky.setColors(sky3, d.sun * (1 - rain));
    blend(fog, d.fog, grey.fog, d.shade, rain);
    scene.background.setRGB(fog.r, fog.g, fog.b, SRGBColorSpace);
    scene.fog.color.copy(scene.background);
    scene.fog.near = LOOK.fogNear * mix(1, WEATHER.fogNearScale, rain);
    scene.fog.far = LOOK.fogFar * mix(1, WEATHER.fogFarScale, rain);
    const light = mix(1, WEATHER.lightScale, rain);
    sun.color.setRGB(d.dirColor.r, d.dirColor.g, d.dirColor.b, SRGBColorSpace);
    sun.intensity = d.dirIntensity * light;
    hemi.color.setRGB(d.hemiSky.r, d.hemiSky.g, d.hemiSky.b, SRGBColorSpace);
    hemi.groundColor.setRGB(d.hemiGround.r, d.hemiGround.g, d.hemiGround.b, SRGBColorSpace);
    hemi.intensity = d.hemiIntensity * light;
    wetLook.uniforms.uWet.value = wet;
    wetLook.uniforms.uSheen.value.copy(scene.background);
    return lightsGlow(d.glow, rain);
  }

  return { update };
}
