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


export const STORAGE_KEYS = Object.freeze({
  best: 'sharp-sharp:best',
  banter: 'sharp-sharp:banter',
  muted: 'sharp-sharp:muted',
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
  // The horn can sound again after this long.
  hornCooldownSeconds: 0.45,
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
  // Passes at pushing the bike out of overlaps, and how far around it to look for solids.
  pushPasses: 4,
  queryRadius: 3,
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
  pedestrian: -0.3,
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
// A sidewalk stands this far above the road, in metres.
export const KERB_HEIGHT = 0.12;

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
  walkY: KERB_HEIGHT,
  markY: 0.035,
  waterY: -0.05,
  rippleSpeed: 0.012,
  rippleRepeat: 40,
  // Ground and water extend this far from the origin so no edge shows at the horizon.
  horizonSpan: 900,
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
  island: '#c9b89a',
  monument: '#d8cfba',
  boatDeck: '#d8cfba',
  boatCabin: '#f1ece0',
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
  // Small body-language beats on top of the ride. Angles are radians, times are seconds.
  react: Object.freeze({
    hopSeconds: 0.34, hopHeight: 0.14,
    pumpSeconds: 0.9, pumpAngle: 1.1, pumpBeats: 2,
    stumbleSeconds: 0.7, stumbleTilt: 0.32, stumbleWobble: 0.12,
    crouchSpeed: 0.1,
    // A crash this hard (health lost) makes the rider stumble.
    hardCrashDamage: 18,
  }),
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

// ---------------------------------------------------------------- guidance and markers
export const GUIDE = Object.freeze({
  // Seconds of simulation between route recalculations while an order is active.
  routeEvery: 0.4,
});

export const MARKERS = Object.freeze({
  pickup: '#ffb020',
  drop: '#35d69a',
  beaconRadius: 2.2,
  beaconHeight: 95,
  ringSegments: 48,
  beaconOpacity: 0.34,
  ringOpacity: 0.55,
  pulseSpeed: 2.4,
  pulseDepth: 0.12,
});

export const MINIMAP = Object.freeze({
  size: 124,
  // Metres from the bike to the edge of the map circle.
  radius: 105,
  // Pixels per metre of the pre-drawn full map.
  baseScale: 2,
  water: '#4f9c9f',
  land: '#d8c08c',
  park: '#8fb36e',
  road: '#fff6e0',
  roadEdge: '#7a6a52',
  // How much wider the dark outline under each road is, in metres.
  outline: 3,
  route: '#2b8cff',
  routeEdge: '#ffffff',
  bike: '#d9472b',
  stop: '#1d1d1d',
  arrow: 7,
});

export const HUD = Object.freeze({
  toastSeconds: 2.2,
  // The target counts as on screen inside this fraction of half the view, so its arrow can hide.
  onScreenLimit: 0.92,
  // The HUD text is refreshed this often, in seconds; events refresh it at once.
  refreshEvery: 0.1,
  // Fraction of the delivery budget left below which the clock bar turns amber.
  warnFraction: 0.3,
});

// ---------------------------------------------------------------- traffic
export const TRAFFIC = Object.freeze({
  maxVehicles: 16,
  // Live vehicles wanted at the start and the end of a shift; density rises a little with progress.
  startVehicles: 9,
  endVehicles: 16,
  // Vehicles drive in the middle of their half of the road: this share of the half-width.
  laneShare: 0.5,
  spawnMin: 70,
  spawnMax: 170,
  // Inside the camera's view cone nothing spawns closer than this, so nothing pops in.
  hiddenMin: 130,
  viewHalfAngle: 0.95,
  despawnFar: 230,
  despawnNear: 150,
  spawnEverySeconds: 0.35,
  spawnClearance: 14,
  accel: 2.6,
  brake: 7,
  turnSpeed: 4.5,
  junctionSpeed: 7,
  junctionZone: 12,
  // A junction curve has about this radius (metres), and its straight lead-in is capped at the max.
  turnRadius: 4,
  turnTangentMax: 9,
  // Vehicles wait this far before the node, claim the junction from `claimZone` further out, and
  // hand it on once `clearDistance` into the next lane.
  stopLine: 7,
  // Entering vehicles hold back while anything on the ring is this close to their entry.
  ringBusyDistance: 16,
  claimZone: 6,
  // A vehicle waits for a nearer one that is within this much further than the claim zone.
  yieldMargin: 6,
  clearDistance: 4,
  lookAhead: 7,
  lookSpeedGain: 1.1,
  stopGap: 2.6,
  gapGain: 0.9,
  corridorMargin: 0.45,
  // A vehicle jammed this long and this far from the bike is removed, so a rare gridlock clears.
  stuckDespawnSeconds: 15,
  stuckDespawnDistance: 50,
  bumpedSeconds: 1.6,
  // Fraction of cruise speed on the narrow market street.
  marketFactor: 0.5,
  carColors: Object.freeze(['#d9d2c0', '#c8553d', '#3f7fb5', '#5aa36b', '#e3a72f', '#7a5a8a', '#2f2f35', '#b9bfc6']),
  // `weight` is the share of spawns; sizes are half-extents in metres; `cruise` is [slowest, fastest] m/s.
  kinds: Object.freeze({
    car: Object.freeze({ weight: 0.7, hw: 0.95, hd: 2.2, cruise: Object.freeze([7.5, 11]) }),
    danfo: Object.freeze({ weight: 0.3, hw: 1.05, hd: 2.6, cruise: Object.freeze([6, 8.5]) }),
  }),
  danfo: Object.freeze({
    stopChance: 0.75,
    dwellSeconds: Object.freeze([3, 6]),
    // How far before the stop node the danfo halts, and how late it starts to swing in.
    stopBack: 14,
    pullInDistance: 17,
    pullRate: 3.4,
    pullLateral: 1.9,
    pullDecel: 9,
  }),
});

// Vehicle models: colours and light glow. Sizes follow TRAFFIC.kinds.
export const VEHICLE_LOOK = Object.freeze({
  glass: '#33414f',
  tyre: '#25252a',
  trim: '#2b2b30',
  danfoBody: '#f2c230',
  danfoRoof: '#e0a91f',
  danfoStripe: '#1d1d1f',
  headlight: '#fff0b0',
  tailLight: '#ff2a1a',
  lightWidth: 0.42,
  lightHeight: 0.22,
  lightY: 0.7,
  lightInset: 0.38,
  lightMax: 0.9,
});

// ---------------------------------------------------------------- pedestrians
export const PEDS = Object.freeze({
  maxPeds: 24,
  startPeds: 9,
  endPeds: 14,
  // The market street's standing crowd: it appears when the player is within `marketFill` metres of
  // its middle (coming from beyond sight), and goes once they are `crowdDespawn` away.
  marketCrowd: 9,
  marketFill: 135,
  marketHysteresis: 25,
  crowdDespawn: 230,
  // A sidewalk walker keeps this far beyond the kerb (min and max), so props are mostly missed.
  lateralMin: 0.9,
  lateralMax: 3,
  marketInset: 0.5,
  walkSpeed: Object.freeze([1, 1.6]),
  crossSpeed: 1.4,
  spawnMin: 25,
  spawnMax: 110,
  hiddenMin: 70,
  despawnFar: 150,
  despawnNear: 100,
  viewHalfAngle: 0.95,
  spawnEverySeconds: 0.3,
  spawnClearance: 1.2,
  // Chance a walker reaching a crossing uses it, and how close to it they must be.
  crossChance: 0.55,
  crossBand: 1.2,
  // At the kerb they wait while a fast bike is this close, or a vehicle moves this near the crossing.
  waitDistance: 22,
  waitSpeed: 4.5,
  vehicleClear: 12,
  radius: 0.3,
  probe: 0.9,
  // Walkers turn at a corner this far (beyond the crossing road's half-width) from the node, and a road
  // counts as a side road when its direction is within this cosine of square-on.
  cornerPocket: 1.5,
  turnDotMax: 0.35,
  turnBackSeconds: 1,
  // Hit by the bike: they fall, get up and carry on. The bike loses speed, the rider loses money.
  hitRadius: 0.32,
  hitPenalty: 300,
  hitSpeedFactor: 0.55,
  stumbleSeconds: 1.5,
  immuneSeconds: 2,
  // A fast pass this close startles them: they step back from the road.
  startleDistance: 2.4,
  startleSpeed: 6,
  startleStep: 0.9,
  stepBackSpeed: 2.4,
  startleSeconds: 1.1,
  shirts: Object.freeze(['#c8553d', '#3f7fb5', '#e3a72f', '#5aa36b', '#7a5a8a', '#d9d2c0', '#2f9e5a', '#d98a2d', '#a33a3a', '#2b3a55']),
  trousers: Object.freeze(['#2b3a55', '#3a3a3a', '#5b4a3a', '#6b6b73', '#1f3f5a', '#7a6a4f']),
  skins: Object.freeze(['#8d5524', '#6b3f1d', '#c68642', '#4a2c14', '#a86a3a']),
  sizes: Object.freeze([0.88, 1.08]),
  look: Object.freeze({ torso: 0.5, legs: 0.7, head: 0.13, bob: 0.04, rock: 0.07, stepRate: 3.6 }),
});

// ---------------------------------------------------------------- banter
export const BANTER = Object.freeze({
  npcCooldownSeconds: 8,
  globalCooldownSeconds: 1.2,
  maxLive: 4,
  durationSeconds: 2.2,
  fadeSeconds: 0.35,
  // Higher wins: a collision shout can replace a bubble that is a near-miss comment or ambient chatter.
  priorities: Object.freeze({ collision: 3, nearMiss: 2, ambient: 1 }),
  // Which kind of priority each line category has.
  categories: Object.freeze({
    conductor: 'ambient',
    annoyed: 'nearMiss',
    impressed: 'nearMiss',
    collision: 'collision',
    pedestrian: 'collision',
    customerLate: 'ambient',
    customerGood: 'ambient',
  }),
  // Share of near misses that the other road user takes well.
  impressedShare: 0.35,
  // A danfo conductor shouts when the bike is this near the stop.
  conductorRange: 30,
  // Metres above the ground where each bubble's tail points, by who is speaking.
  height: Object.freeze({ vehicle: 2.8, danfo: 3.1, pedestrian: 2.1, customer: 2.4 }),
  screenMargin: 12,
  checkEverySeconds: 0.5,
});

// ---------------------------------------------------------------- audio (WebAudio, no files)
export const AUDIO = Object.freeze({
  master: 0.5,
  // C major pentatonic, two octaves (C4 D4 E4 G4 A4 C5 D5 E5 G5 A5).
  scale: Object.freeze([261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0]),
  // The engine: two detuned oscillators through a low-pass whose pitch and brightness follow speed.
  engine: Object.freeze({
    idleHz: 52,
    topHz: 170,
    detune: 1.5,
    filterIdle: 320,
    filterTop: 1900,
    gainIdle: 0.035,
    gainTop: 0.1,
    // Seconds the engine takes to follow speed: short, so it feels attached.
    follow: 0.07,
    // Throttle lifts the note a little over the speed alone.
    throttleLift: 0.12,
  }),
  horn: Object.freeze({ low: 392, high: 494, seconds: 0.36, gain: 0.22, filter: 1500 }),
  noteSeconds: 0.45,
  noteGain: 0.28,
  pickupNotes: Object.freeze([5, 7]),
  deliveryNotes: Object.freeze([5, 6, 7, 8, 9]),
  deliveryGap: 0.085,
  overNotes: Object.freeze([3, 0]),
  overGap: 0.24,
  crash: Object.freeze({ thudHz: 110, thudEndHz: 40, thudSeconds: 0.28, noiseSeconds: 0.34, noiseFilter: 1100, gain: 0.55 }),
  nearMiss: Object.freeze({ from: 520, to: 940, seconds: 0.22, gain: 0.16 }),
  bump: Object.freeze({ hz: 150, endHz: 70, seconds: 0.15, gain: 0.3 }),
  rain: Object.freeze({ filter: 2400, q: 0.7, gain: 0.2, follow: 0.4 }),
  noiseSeconds: 2,
  silent: 0.0001,
});
