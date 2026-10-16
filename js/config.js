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
  deflect: 0.6,
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
