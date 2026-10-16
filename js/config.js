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

export const STORAGE_KEYS = Object.freeze({
  best: 'sharp-sharp:best',
});

// ---------------------------------------------------------------- shift
export const SHIFT = Object.freeze({
  seconds: 300,
  startHealth: 100,
  // Ride again by Space or Enter only after the summary has had a moment on screen.
  restartDelaySeconds: 0.8,
  // Seconds the bike must sit nearly still before the recover button appears.
  stuckSeconds: 3,
  stuckSpeed: 0.8,
});

// ---------------------------------------------------------------- bike
// One world unit is one metre. Heading 0 faces +z; forward is (sin h, cos h); steer > 0 turns right.
export const BIKE = Object.freeze({
  topSpeed: 16,
  accel: 9,
  brake: 16,
  // Coasting loses speed through `coastDrag * v + rolling`, so speed settles without throttle.
  coastDrag: 0.22,
  rolling: 0.6,
  wheelbase: 1.3,
  maxSteerDeg: 32,
  // Sideways acceleration the tyres can hold on dry road. It sets how far the steering angle
  // shrinks with speed, and rain scales it down through `grip`.
  lateralAccel: 11,
  steerRiseRate: 7,
  steerFallRate: 11,
  // How fast the travel direction swings toward the heading. Lower grip leaves a small slide.
  alignRate: 14,
  slipScrub: 0.7,
  leanGain: 0.045,
  leanMax: 0.5,
  leanRate: 8,
  // Two circles along the bike's length stand in for its body.
  radius: 0.42,
  circleOffset: 0.5,
  // Rolling against a wall below this closing speed costs nothing.
  minDamageImpact: 3,
  damageMin: 10,
  damageMax: 35,
  damageFullImpact: 16,
  restitution: 0.25,
  tangentKeep: 0.9,
  // After a hit the heading swings toward the new travel direction, by at most `maxDeflect`.
  deflect: 0.6,
  maxDeflect: 0.8,
  hitCooldownSeconds: 0.4,
  // Grip on dry road; rain lowers it in a later pass.
  gripDry: 1,
});

// How the ground changes the bike. `speedFactor` scales the top speed; `overCapRate` is how
// fast excess speed is shed per second.
export const SURFACES = Object.freeze({
  road: Object.freeze({ speedFactor: 1, overCapRate: 3 }),
  plaza: Object.freeze({ speedFactor: 0.9, overCapRate: 3 }),
  sidewalk: Object.freeze({ speedFactor: 0.6, overCapRate: 3.5 }),
  sand: Object.freeze({ speedFactor: 0.4, overCapRate: 4 }),
  grass: Object.freeze({ speedFactor: 0.33, overCapRate: 4.5 }),
});

// ---------------------------------------------------------------- collisions
export const COLLIDE = Object.freeze({
  cell: 16,
  // A near miss needs the gap between surfaces to be under `maxGap` metres at speed.
  nearMissGap: 1.2,
  nearMissMinSpeed: 8,
  nearMissCooldownSeconds: 4,
});

// ---------------------------------------------------------------- orders and money
export const ECONOMY = Object.freeze({
  fareFlat: 300,
  farePerMetre: 4,
  fareRoundTo: 50,
  tipShare: 0.6,
  lateFareFactor: 0.6,
  budgetSpeed: 8.5,
  budgetSlack: 1.35,
  budgetPadSeconds: 10,
  nearMissBonus: 50,
  nearMissMax: 5,
});

export const ORDERS = Object.freeze({
  pickupRadius: 6,
  dropRadius: 6,
  // Delivery legs outside this route length (metres) are not offered.
  deliveryMin: 110,
  deliveryMax: 380,
  // How far the bike may be from the vendor when an order appears.
  pickupMin: 50,
  pickupMax: 260,
});

export const RATING = Object.freeze({
  start: 5,
  min: 1,
  max: 5,
  cleanOnTime: 0.2,
  dirtyOnTime: 0.05,
  late: -0.5,
  crash: -0.15,
});

// ---------------------------------------------------------------- start.ng
export const START_NG = Object.freeze({
  origin: 'https://start.ng',
  whoamiTimeoutMs: 5000,
  scoreTimeoutMs: 8000,
  leaderboardTimeoutMs: 5000,
  // The helper's own timer starts only once the frame has loaded; this covers a frame that never does.
  frameGraceMs: 1000,
  leaderboardLimit: 10,
  facePrefix: 'data:image/png;base64,',
  nameMaxLength: 40,
  guestQuery: 'guest',
  sessionHashKey: 'startng_session',
});

export const STAT_KEYS = Object.freeze({ earnings: 'earnings', deliveries: 'deliveries' });
export const SCORE_LIMITS = Object.freeze({ min: 0, max: 1_000_000_000 });

// ---------------------------------------------------------------- character
export const STYLE_OPTIONS = Object.freeze({
  body: Object.freeze(['female', 'male']),
  hair: Object.freeze(['short', 'afro', 'braids', 'bun', 'ponytail', 'dreads', 'bald']),
  hat: Object.freeze(['none', 'cap', 'beanie', 'tophat', 'crown']),
  accessory: Object.freeze(['none', 'glasses', 'earrings', 'beard', 'scarf', 'backpack']),
});

// start.ng's own guest look is only known at runtime; this is the local stand-in.
export const GUEST_STYLE = Object.freeze({
  body: 'male',
  primaryColor: '#d9472b',
  secondaryColor: '#2b3a55',
  skinColor: '#8d5524',
  hairColor: '#17120f',
  hair: 'short',
  hat: 'none',
  accessory: 'none',
});

// ---------------------------------------------------------------- city generation
export const CITY = Object.freeze({
  // The layout seed is fixed so the district is the same every shift; only orders vary.
  seed: 20261016,
  minLot: 8,
  // Clear ground kept around the roundabout, beyond its sidewalk.
  roundaboutClearance: 1.5,
  // Per block type: largest lot side, storey height range in metres, chance a lot is left open.
  lots: Object.freeze({
    mixed: Object.freeze({ maxSide: 30, minH: 8, maxH: 18, yard: 0.08, palette: 'warm', shops: true }),
    lowrise: Object.freeze({ maxSide: 24, minH: 5, maxH: 9, yard: 0.1, palette: 'warm', shops: true }),
    commercial: Object.freeze({ maxSide: 40, minH: 16, maxH: 34, yard: 0.05, palette: 'cool', shops: true }),
    tall: Object.freeze({ maxSide: 36, minH: 24, maxH: 48, yard: 0.03, palette: 'cool', shops: false }),
    market: Object.freeze({ maxSide: 14, minH: 3.5, maxH: 5.5, yard: 0, palette: 'warm', shops: true }),
    mall: Object.freeze({ maxSide: 76, minH: 9, maxH: 12, yard: 0.5, palette: 'cool', shops: false }),
    estate: Object.freeze({ maxSide: 26, minH: 4, maxH: 6.5, yard: 0, palette: 'warm', shops: false }),
  }),
  estate: Object.freeze({ setback: 4, minHouse: 6, wallThickness: 0.4, wallHeight: 2 }),
  school: Object.freeze({ width: 24, depth: 10, height: 7 }),
  // One window column per `windowWidth` metres and one floor per `floorHeight`.
  windowWidth: 3.2,
  floorHeight: 3.4,
  palettes: Object.freeze({
    warm: Object.freeze(['#e9c46a', '#9bb98a', '#e0a39a', '#d9c2a0', '#a9c4c0', '#cfa77a', '#e7d6b8', '#d38f7e', '#c9d49a']),
    cool: Object.freeze(['#9fb1c0', '#b7b0a3', '#c5cbd1', '#a9b8a0', '#d2c7b4', '#b2a7b8']),
  }),
  roof: '#a39d90',
  shopColors: Object.freeze(['#2f6f9f', '#2f9e5a', '#d9472b', '#ee8a2d', '#8a4fc7', '#1f8a8a']),
  awningColors: Object.freeze(['#c8553d', '#e3a72f', '#3f7fb5', '#5aa36b', '#d9d2c0']),
  shopHeight: 2.8,
  awningDrop: 2.6,
  awningDepth: 1.4,
  awningChance: 0.7,
  shopChance: 0.7,
  billboardChance: 0.35,
  billboardMinHeight: 14,
  roofTankChance: 0.5,
  roofAntennaChance: 0.4,
  roofStairChance: 0.5,
  // Street furniture, in metres along a road side.
  lampSpacing: 34,
  treeSpacing: 17,
  kioskChance: 0.12,
  furnitureMinGap: 4.5,
  stallSpacing: 4.4,
  rubbishCount: 40,
  generatorCount: 14,
  barrierCount: 18,
  parkedCarSpacing: 3.2,
  parkedCarsPerYard: 8,
  // Fraction of a park or field covered with trees.
  parkTrees: 26,
  perimeterTreeSpacing: 16,
  skylineCount: 70,
  skylineNear: 245,
  skylineFar: 340,
  boats: 7,
});

// Footprints for solid props, and the sizes the meshes are built to. Half-extents in metres.
export const PROPS = Object.freeze({
  palm: Object.freeze({ shape: 'circle', r: 0.3 }),
  almond: Object.freeze({ shape: 'circle', r: 0.4 }),
  lamp: Object.freeze({ shape: 'circle', r: 0.22 }),
  light: Object.freeze({ shape: 'circle', r: 0.18 }),
  kiosk: Object.freeze({ shape: 'box', hw: 2.1, hd: 1.3, h: 2.6 }),
  stall: Object.freeze({ shape: 'box', hw: 1.1, hd: 1.1, h: 2.1 }),
  barrier: Object.freeze({ shape: 'box', hw: 1.1, hd: 0.3, h: 0.9 }),
  car: Object.freeze({ shape: 'box', hw: 0.95, hd: 2.2, h: 1.5 }),
  generator: Object.freeze({ shape: 'box', hw: 0.7, hd: 0.5, h: 1 }),
  shelter: Object.freeze({ shape: 'box', hw: 1.5, hd: 0.75, h: 2.6 }),
  gate: Object.freeze({ shape: 'box', hw: 1.6, hd: 0.3, h: 2.4 }),
  container: Object.freeze({ shape: 'box', hw: 1.2, hd: 3, h: 2.6 }),
  bench: Object.freeze({ shape: 'box', hw: 0.9, hd: 0.3, h: 0.9 }),
  rubbish: Object.freeze({ shape: 'none', r: 0.6 }),
  goal: Object.freeze({ shape: 'none', r: 1.5 }),
});

// ---------------------------------------------------------------- look
export const LOOK = Object.freeze({
  chunk: 116,
  ground: '#cfae78',
  sand: '#d8bf8a',
  grass: '#7fa563',
  plaza: '#b9a98c',
  sidewalk: '#c8b89c',
  kerb: '#a69a84',
  road: '#56524e',
  roadMark: '#d9d1b0',
  roadEdge: '#e8e0c8',
  zebra: '#e9e4d2',
  water: '#4f9c9f',
  quay: '#8d8576',
  bridgeDeck: '#6b6660',
  bridgeRail: '#c9c0aa',
  pier: '#9a9282',
  wall: '#d8c9a8',
  wallStripe: '#c8553d',
  horizon: '#f6d9a0',
  fogNear: 110,
  fogFar: 430,
  roadY: 0.02,
  walkY: 0.12,
  markY: 0.035,
  waterY: -0.05,
  rippleSpeed: 0.012,
  rippleRepeat: 40,
  // Dashed centre line: dash length and gap, in metres.
  dash: 3,
  dashGap: 4.5,
  markWidth: 0.22,
  zebraStripe: 0.6,
  zebraGap: 0.6,
  zebraDepth: 3,
  atlasCell: Object.freeze({ width: 512, height: 128 }),
  atlas: Object.freeze({ width: 1024, height: 2048 }),
  facadeTile: 128,
  rippleTile: 256,
});

// Colours and sizes of the props, which are modelled from boxes, cylinders and cones.
export const PROP_LOOK = Object.freeze({
  trunk: '#7a5a3a',
  palmLeaf: '#4f8f43',
  palmLeafDark: '#3f7a3a',
  almondLeaf: '#5c9a45',
  almondLeafLight: '#78b055',
  lamp: '#4a4f55',
  bulb: '#fff1b8',
  glass: '#2c3b4a',
  roofWhite: '#efe8d8',
  concrete: '#b3ada0',
  stripeRed: '#c8553d',
  stripeWhite: '#f1ece0',
  carGlass: '#33414f',
  carTyre: '#25252a',
  generator: '#d98a2d',
  generatorDark: '#3a3a3a',
  shelterRoof: '#2f6f9f',
  frame: '#4a4f55',
  gatePost: '#d8cfba',
  goal: '#f1ece0',
  lightRed: '#e0452f',
  lightAmber: '#f2b231',
  lightGreen: '#3fbf6a',
  stall: '#5a4a3a',
  stool: '#8a6a4a',
  grassDark: '#6a914f',
  island: '#c9b89a',
  monument: '#d8cfba',
  boatDeck: '#d8cfba',
  boatCabin: '#f1ece0',
  skyscraper: '#b4b9c4',
});

// ---------------------------------------------------------------- sky
// Golden afternoon. The gradient is drawn in screen space (see sky.js).
export const SKY = Object.freeze({
  radius: 480,
  horizon: '#f7d79a',
  mid: '#f2a65f',
  zenith: '#6f9bd1',
  horizonAt: 0.42,
  zenithAt: 1.1,
  // Sun position on screen, as a fraction of its width and height.
  sun: Object.freeze([0.7, 0.5]),
});

// ---------------------------------------------------------------- chase camera
export const CHASE = Object.freeze({
  distance: 6.4,
  height: 2.9,
  // How far ahead of the bike the camera looks, and how far it shifts sideways with the steering.
  lookAhead: 5,
  lookHeight: 1.3,
  lookSide: 1.8,
  // Seconds the camera takes to catch up (critically damped).
  smoothTime: 0.22,
  yawSmoothTime: 0.28,
  reducedSmoothTime: 0.4,
  fovBase: 62,
  fovPortrait: 74,
  fovSpeedGain: 12,
  fovSmoothTime: 0.4,
  // Below this speed the camera keeps its heading rather than swinging about.
  yawMinSpeed: 0.5,
  // A building between bike and camera pulls the camera in, never closer than this.
  minDistance: 2,
  wallMargin: 0.7,
  portraitAspect: 0.8,
  // The slow walk-around of the bike on the title and summary screens. The bike is pushed to
  // the side of the screen (or toward the top on a phone) so the card does not cover it.
  orbit: Object.freeze({ radius: 5.2, portraitRadius: 8.4, height: 2, speed: 0.22, lookHeight: 0.9, shiftSide: 2.6, shiftUp: 1.6, fov: 46 }),
});

// ---------------------------------------------------------------- rider and bike model
export const RIDER = Object.freeze({
  scale: 1.25,
  seatY: 0.9,
  seatZ: -0.22,
  lean: 0.18,
  wheelRadius: 0.32,
  wheelBase: 0.62,
  // How quickly the drawn height follows the ground, so kerbs are not hard steps.
  heightLambda: 18,
  // Where the hands hold the handlebar, in bike space.
  grip: Object.freeze({ x: 0.28, y: 1.02, z: 0.5 }),
  pitchSample: 0.8,
  shadow: Object.freeze({ width: 0.55, length: 1.15, opacity: 0.32, lift: 0.04 }),
  paint: '#2f6f9f',
  paintDark: '#1f4f73',
  metal: '#3a3d42',
  tyre: '#222226',
  rim: '#cfcac0',
  seat: '#2a2523',
  box: '#e8e2d2',
  boxBand: '#d9472b',
  headlight: '#fff3c4',
  tail: '#d9302a',
});

// Rider proportions, in figure units (the figure is scaled by RIDER.scale on the bike).
export const CHARACTER = Object.freeze({
  gold: '#f4c542',
  shoe: '#241d33',
  eye: '#1d1626',
  eyeWhite: '#f6f1ea',
  hatDark: '#1c1626',
  legWidth: 0.12,
  torsoHeight: 0.34,
  torsoDepth: 0.2,
  torsoWidthMale: 0.38,
  torsoWidthFemale: 0.3,
  armWidth: 0.085,
  skirtTop: 0.15,
  skirtBottom: 0.23,
  headRadius: 0.165,
  neckGap: 0.01,
  segments: 8,
});
