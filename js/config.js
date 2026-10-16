// Every tunable lives here. Grouped by who reads it.

export const GAME_NAME = 'Sharp Sharp';

// ---------------------------------------------------------------- rendering
export const RENDER = Object.freeze({
  pixelRatioCap: 2,
  // Longest frame the loop will account for; a hidden tab or a stall never teleports the sim.
  maxFrameSeconds: 0.1,
  fixedStep: 1 / 60,
});

export const CAMERA = Object.freeze({
  fov: 62,
  near: 0.3,
  far: 520,
});

export const LIGHTS = Object.freeze({
  dirColor: '#ffe2b0',
  dirIntensity: 2.6,
  dirPosition: Object.freeze([-60, 90, -40]),
  hemiSky: '#bfdcff',
  hemiGround: '#a67c52',
  hemiIntensity: 1.7,
});

export const SCENE_COLORS = Object.freeze({
  ground: '#c9a46a',
  background: '#f2b94b',
});
