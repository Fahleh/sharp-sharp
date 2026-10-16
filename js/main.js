// Bootstrap. Stage 1: a lit scene that proves the vendored three.js, the importmap and the loop.

import {
  WebGLRenderer, Scene, PerspectiveCamera, DirectionalLight, HemisphereLight, Mesh, BoxGeometry,
  PlaneGeometry, MeshLambertMaterial, Color, SRGBColorSpace,
} from 'three';
import { CAMERA, LIGHTS, RENDER, SCENE_COLORS } from './config.js';

const canvas = document.getElementById('scene');
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = SRGBColorSpace;

const scene = new Scene();
scene.background = new Color(SCENE_COLORS.background);
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
camera.position.set(6, 5, 9);
camera.lookAt(0, 1, 0);

const sun = new DirectionalLight(LIGHTS.dirColor, LIGHTS.dirIntensity);
sun.position.set(...LIGHTS.dirPosition);
const hemi = new HemisphereLight(LIGHTS.hemiSky, LIGHTS.hemiGround, LIGHTS.hemiIntensity);
const ground = new Mesh(new PlaneGeometry(200, 200), new MeshLambertMaterial({ color: SCENE_COLORS.ground }));
ground.rotation.x = -Math.PI / 2;
const box = new Mesh(new BoxGeometry(2, 2, 2), new MeshLambertMaterial({ color: '#2fa36b', flatShading: true }));
box.position.y = 1;
scene.add(sun, hemi, ground, box);

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, RENDER.pixelRatioCap);
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((time) => {
  box.rotation.y = time / 1000;
  renderer.render(scene, camera);
});
document.body.dataset.state = 'ready';
