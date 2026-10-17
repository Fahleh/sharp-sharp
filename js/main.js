// Bootstrap and the loop: renderer, scene, fixed-step simulation, camera, input and UI.

import {
  WebGLRenderer, Scene, PerspectiveCamera, DirectionalLight, HemisphereLight, Fog, Color, SRGBColorSpace,
} from 'three';
import { BANTER, CAMERA, COLLIDE, GUEST_STYLE, LIGHTS, LOOK, RENDER, RIDER, SHIFT } from './config.js';
import { createStaticIndex } from './collide.js';
import { CUSTOMERS, MAP, SPAWN, VENDORS, blockRect } from './map.js';
import { createTerrain } from './terrain.js';
import { generateCity } from './city.js';
import { createWorld } from './world.js';
import { createSky } from './sky.js';
import { createAtmosphere } from './atmosphere.js';
import { createRainMesh } from './rainmesh.js';
import { createWetLook } from './wetlook.js';
import { createStreetlights } from './streetlights.js';
import { createRider } from './rider.js';
import { createAudio } from './audio.js';
import { createFeedback } from './feedback.js';
import { createChaseCamera } from './camera.js';
import { createInput } from './input.js';
import { createGame } from './game.js';
import { createUi } from './ui.js';
import { createMarkers } from './markers.js';
import { createVehicleMeshes } from './vehiclemesh.js';
import { createPedMeshes } from './pedmesh.js';
import { createMinimap } from './minimap.js';
import { createPresenter } from './presenter.js';
import { createBanter } from './banter.js';
import { createBubbles } from './bubbles.js';
import { createChatter } from './chatter.js';
import { LINES } from './lines.js';
import { createRng, randomSeed } from './rng.js';
import { loadBanter, loadMuted, saveBanter, saveMuted } from './storage.js';
import { normalizeStyle } from './validate.js';
import { clearSessionFromAddress, isGuestMode, signIn } from './startng.js';
import { createProfile } from './profile.js';
import { createResults } from './results.js';

const canvas = document.getElementById('scene');
const lifetime = new AbortController();
const { signal } = lifetime;

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = () => motionQuery.matches;

// The UI is created before the renderer so a WebGL failure can still show its message;
// its buttons reach the game through these once the game exists.
const actions = { start: () => {}, togglePause: () => {}, recover: () => {}, banter: () => {}, sound: () => {} };
const ui = createUi({
  onStart: () => actions.start(),
  onPause: () => actions.togglePause(),
  onResume: () => actions.togglePause(),
  onRecover: () => actions.recover(),
  onAgain: () => actions.start(),
  onSignIn: signIn,
  onBanter: (on) => actions.banter(on),
  onSound: (on) => actions.sound(on),
});
clearSessionFromAddress();

let renderer;
try {
  renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  ui.showFallback();
}

if (renderer) {
  renderer.outputColorSpace = SRGBColorSpace;
  canvas.addEventListener('webglcontextlost', (event) => event.preventDefault(), { signal });

  const scene = new Scene();
  scene.background = new Color(LOOK.horizon);
  scene.fog = new Fog(LOOK.horizon, LOOK.fogNear, LOOK.fogFar);
  const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  const sun = new DirectionalLight(LIGHTS.dirColor, LIGHTS.dirIntensity);
  sun.position.set(...LIGHTS.dirPosition);
  const hemi = new HemisphereLight(LIGHTS.hemiSky, LIGHTS.hemiGround, LIGHTS.hemiIntensity);

  const terrain = createTerrain();
  const city = generateCity({ terrain });
  const wetLook = createWetLook();
  const world = createWorld({ terrain, city, map: MAP, maxAnisotropy: renderer.capabilities.getMaxAnisotropy(), wetLook });
  const sky = createSky();
  const atmosphere = createAtmosphere({ scene, sky, sun, hemi, wetLook });
  const streetlights = createStreetlights(city);
  const rain = createRainMesh({ rng: createRng(randomSeed()), reducedMotion });
  const rider = createRider({ style: normalizeStyle(GUEST_STYLE), reducedMotion });
  const markers = createMarkers();
  const vehicles = createVehicleMeshes({ terrain });
  const crowd = createPedMeshes({ terrain });
  scene.add(sky.mesh, world.group, markers.group, vehicles.group, crowd.group, streetlights.points, rain.lines, rider.group, rider.shadow, sun, hemi);

  // Only buildings tall enough to hide the bike from the camera can block its view.
  const blockers = createStaticIndex(
    city.buildings.filter((b) => b.h >= 5).map((b) => ({ type: 'box', x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 })),
    COLLIDE.cell,
  );
  const chase = createChaseCamera({ camera, blockers, reducedMotion });
  const game = createGame({
    terrain, index: city.index, graph: MAP.graph, vendors: VENDORS, customers: CUSTOMERS, stops: MAP.landmarks.map((l) => l.node), crossings: city.crossings, spawn: SPAWN,
  });
  const minimap = createMinimap({ canvas: document.getElementById('minimap'), map: MAP, blockRect });

  // The guest look first; the real character swaps in between shifts when start.ng answers.
  const profile = createProfile({
    onApply: (player) => {
      rider.setStyle(player.style);
      ui.setProfile(player);
    },
    canApplyNow: () => game.state.phase === 'ready' || game.state.phase === 'gameover',
  });
  const results = createResults({ ui, profile, guestMode: isGuestMode() });

  // Road banter: the picker decides who may speak, `lines.js` holds every word.
  const chatter = createChatter({
    game,
    banter: createBanter({ rng: createRng(randomSeed()), lines: LINES, rules: BANTER }),
    bubbles: createBubbles({ container: ui.bubbleLayer, camera }),
    rng: createRng(randomSeed()),
    terrain,
  });
  const setBanter = (on) => {
    chatter.setEnabled(on);
    ui.setBanter(on);
  };
  setBanter(loadBanter());
  actions.banter = (on) => {
    setBanter(on);
    saveBanter(on);
  };

  // Sound starts on the first gesture, since browsers refuse to play before one.
  const audio = createAudio({ muted: loadMuted() });
  const feedback = createFeedback({ audio, rider });
  ui.setSound(!loadMuted());
  actions.sound = (on) => {
    audio.setMuted(!on);
    ui.setSound(on);
    saveMuted(!on);
  };
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => audio.unlock(), { signal, capture: true });

  let againTimer = 0;
  const presenter = createPresenter({
    game, ui, markers, minimap, terrain, camera,
    onGameOver: (summary) => {
      ui.setState('gameover');
      ui.setAgainReady(false);
      clearTimeout(againTimer);
      againTimer = setTimeout(() => ui.setAgainReady(true), SHIFT.restartDelaySeconds * 1000);
      results.show(summary);
    },
  });
  const input = createInput({
    signal,
    buttons: ui.buttons,
    onPause: () => actions.togglePause(),
    onRecover: () => actions.recover(),
    onConfirm: () => actions.start(),
    isPlaying: () => game.state.phase === 'playing',
  });

  // ---- drawn state: the sim runs in fixed steps, drawing blends between the last two
  const drawn = { x: SPAWN.x, y: 0, z: SPAWN.z, heading: SPAWN.heading, speed: 0, steer: 0, steerAngle: 0, lean: 0, pitch: 0 };
  let previous = { ...drawn };
  let current = { ...drawn };
  const copyBike = (b) => ({ x: b.x, z: b.z, heading: b.heading, speed: b.speed, steer: b.steer, steerAngle: b.steerAngle, lean: b.lean });

  function blendBike(alpha, dt) {
    const lerp = (a, b) => a + (b - a) * alpha;
    drawn.x = lerp(previous.x, current.x);
    drawn.z = lerp(previous.z, current.z);
    const dh = Math.atan2(Math.sin(current.heading - previous.heading), Math.cos(current.heading - previous.heading));
    drawn.heading = previous.heading + dh * alpha;
    drawn.speed = lerp(previous.speed, current.speed);
    drawn.steer = lerp(previous.steer, current.steer);
    drawn.steerAngle = lerp(previous.steerAngle, current.steerAngle);
    drawn.lean = lerp(previous.lean, current.lean);
    const ground = terrain.heightAt(drawn.x, drawn.z);
    drawn.y += (ground - drawn.y) * (1 - Math.exp(-RIDER.heightLambda * dt));
    const ahead = terrain.heightAt(drawn.x + Math.sin(drawn.heading) * RIDER.pitchSample, drawn.z + Math.cos(drawn.heading) * RIDER.pitchSample);
    const behind = terrain.heightAt(drawn.x - Math.sin(drawn.heading) * RIDER.pitchSample, drawn.z - Math.cos(drawn.heading) * RIDER.pitchSample);
    drawn.pitch = Math.atan2(ahead - behind, RIDER.pitchSample * 2);
  }

  function snapDrawn() {
    const b = game.state.bike;
    current = copyBike(b);
    previous = { ...current };
    drawn.y = terrain.heightAt(b.x, b.z);
    blendBike(1, 0);
    chase.reset({ ...drawn });
  }

  function beginShift() {
    const { phase } = game.state;
    if (phase === 'playing' || phase === 'paused') return;
    // Ride again is only live a moment after the summary appears.
    if (phase === 'gameover' && !ui.againReady()) return;
    clearTimeout(againTimer);
    results.cancel();
    profile.applyPending();
    const events = game.start(randomSeed());
    input.release();
    snapDrawn();
    presenter.reset();
    chatter.reset();
    ui.setState('playing');
    presenter.handle(events);
    feedback.handle(events);
    resetClock();
  }

  function togglePause() {
    const { phase } = game.state;
    if (phase !== 'playing' && phase !== 'paused') return;
    game.setPaused(phase === 'playing');
    input.release();
    ui.setState(game.state.phase);
    resetClock();
  }

  actions.start = beginShift;
  actions.togglePause = togglePause;
  actions.recover = () => game.recover();

  // ---- loop
  let last = null;
  let accumulator = 0;
  let throttle = 0;
  const resetClock = () => { last = null; accumulator = 0; };

  function frame(time) {
    const seconds = time / 1000;
    const dt = last === null ? 0 : Math.min((time - last) / 1000, RENDER.maxFrameSeconds);
    last = time;
    accumulator += dt;
    while (accumulator >= RENDER.fixedStep) {
      previous = current;
      if (game.state.phase === 'playing') {
        const intent = input.read();
        throttle = intent.throttle;
        const events = game.step(RENDER.fixedStep, intent);
        current = copyBike(game.state.bike);
        if (events.length > 0) {
          presenter.handle(events);
          chatter.handle(events);
          feedback.handle(events);
        }
      }
      accumulator -= RENDER.fixedStep;
    }
    blendBike(accumulator / RENDER.fixedStep, dt);

    const { state } = game;
    ui.setSpeed(drawn.speed);
    ui.setRecover(state.canRecover);
    ui.setTouch(input.touchMode());

    feedback.update({ speed: drawn.speed, throttle, playing: state.phase === 'playing' });
    rider.update({ ...drawn, dt });
    if (state.phase === 'ready' || state.phase === 'gameover') chase.orbit(drawn, seconds);
    else if (dt > 0) chase.update(drawn, dt);
    presenter.update(dt, drawn);
    if (state.phase === 'playing' || state.phase === 'paused') chatter.update(dt);
    crowd.update(game.peds.peds, accumulator / RENDER.fixedStep);
    markers.update(seconds, reducedMotion());
    world.update(seconds);
    sky.follow(camera.position);
    const progress = state.phase === 'ready' ? 0 : state.elapsed / SHIFT.seconds;
    const glow = atmosphere.update({ progress, rain: state.rain, wet: state.wet });
    streetlights.update(glow);
    rain.update({ dt: state.phase === 'paused' ? 0 : dt, rain: state.rain, camera: camera.position });
    vehicles.update(game.traffic.vehicles, accumulator / RENDER.fixedStep, glow);
    audio.rain(state.phase === 'playing' ? state.rain : 0);
    renderer.render(scene, camera);
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, RENDER.pixelRatioCap);
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    sky.resize({ width: renderer.domElement.width, height: renderer.domElement.height });
  }
  window.addEventListener('resize', resize, { signal });
  window.addEventListener('orientationchange', resize, { signal });
  resize();

  // A hidden tab pauses the shift and stops the clock; coming back never catches up.
  function hide() {
    audio.suspend();
    if (game.state.phase === 'playing') togglePause();
    input.release();
    resetClock();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hide();
    } else {
      resetClock();
      audio.resume();
      profile.refresh();
    }
  }, { signal });
  window.addEventListener('focus', () => profile.refresh(), { signal });
  window.addEventListener('pagehide', hide, { signal });
  // A page restored from the back-forward cache keeps its state: just restart the clock.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      resetClock();
      audio.resume();
      resize();
    }
  }, { signal });

  presenter.reset();
  snapDrawn();
  renderer.setAnimationLoop(frame);
  ui.setState('ready');
  profile.refresh();
}
