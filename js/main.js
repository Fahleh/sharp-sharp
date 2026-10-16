// Bootstrap. Stage 3: the district, lit and fogged, seen from a slow fly-around.

import {
  WebGLRenderer, Scene, PerspectiveCamera, DirectionalLight, HemisphereLight, Fog, Color, SRGBColorSpace,
} from 'three';
import { CAMERA, LIGHTS, LOOK, RENDER } from './config.js';
import { MAP } from './map.js';
import { createTerrain } from './terrain.js';
import { generateCity } from './city.js';
import { createWorld } from './world.js';
import { createSky } from './sky.js';

const canvas = document.getElementById('scene');
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = SRGBColorSpace;

const scene = new Scene();
scene.background = new Color(LOOK.horizon);
scene.fog = new Fog(LOOK.horizon, LOOK.fogNear, LOOK.fogFar);
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
const sun = new DirectionalLight(LIGHTS.dirColor, LIGHTS.dirIntensity);
sun.position.set(...LIGHTS.dirPosition);
const hemi = new HemisphereLight(LIGHTS.hemiSky, LIGHTS.hemiGround, LIGHTS.hemiIntensity);

const terrain = createTerrain();
const city = generateCity({ terrain });
const world = createWorld({ terrain, city, map: MAP, maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
const sky = createSky();
scene.add(sky.mesh, world.group, sun, hemi);

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, RENDER.pixelRatioCap);
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  sky.resize({ width: renderer.domElement.width, height: renderer.domElement.height });
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((time) => {
  const seconds = time / 1000;
  const angle = seconds * 0.08;
  camera.position.set(Math.sin(angle) * 150, 28, Math.cos(angle) * 110 - 20);
  camera.lookAt(0, 6, -20);
  world.update(seconds);
  sky.follow(camera.position);
  renderer.render(scene, camera);
});
document.body.dataset.state = 'ready';
