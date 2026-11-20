// Meridian Heat — tuning, city layout and story data.
// One clear job: every number the game runs on lives here, so the other
// modules never hard-code a coordinate or a balance value.

export const WORLD = {
  roadPitch: 48,          // distance between road centre lines
  roadHalf: 7,            // half width of a road
  roads: [-192, -144, -96, -48, 0, 48, 96, 144, 192],
  bound: 216,             // city edge (buildings stay inside)
  marinaZ: 200,           // water starts here (south edge)
  marinaEnd: 268,
  northChannelZ: -216,    // water channel starts here (north edge)
  northEnd: -268,
  bridgeX: 0,             // bridge crosses the north channel at x = 0
  bridgeHalf: 10,
};

export const TUNING = {
  walkSpeed: 6,
  sprintSpeed: 10,
  carAccel: 26,
  carBrake: 42,
  carMaxSpeed: 46,
  carReverseMax: 14,
  carTurn: 1.9,
  carGrip: 3.2,
  playerHealth: 100,
  pistolDamage: 34,
  pistolMag: 12,
  pistolReserve: 96,
  meleeDamage: 25,
  meleeRange: 2.4,
  enemyHealth: 68,
  enemyDamage: 7,
  enemyRange: 26,
  policeRamDamage: 12,
  heatPerSteal: 26,
  heatPerPedHit: 34,
  heatPerShot: 6,
  heatPerKill: 30,
  heatDecay: 2.2,         // heat points lost per second while clean
  heatPerStar: 34,
  maxStars: 5,
  bustTime: 2.2,          // seconds a cop must stay close to bust you
  saveKey: 'meridian-heat-save-v1',
};

export const COLORS = {
  sky: 0x87b5d9,
  fog: 0x9db8c9,
  sun: 0xfff2d0,
  ground: 0x3d4450,
  road: 0x23272f,
  roadLine: 0xd8c95a,
  sidewalk: 0x6b7280,
  water: 0x1d5f7a,
  sand: 0xc9b285,
  building: [0x8a7f72, 0x6f7d8c, 0x9c8a76, 0x7a6f8a, 0x5f7480, 0xa08a6a],
  windowLit: 0xffd98a,
  windowDark: 0x2a3340,
  carBody: [0xc0392b, 0x2471a3, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0xe67e22],
  police: 0x1a2a44,
  taxi: 0xf5c518,
  player: 0x2ecc71,
  enemy: 0xe74c3c,
  marker: 0xffd23e,
  health: 0x2ecc71,
};

// Parked cars the player can steal (x, z, heading). The first is the
// starter car parked by the player's apartment.
export const PARKED_CARS = [
  { x: 10, z: 30, h: 0, kind: 'sedan' },
  { x: -40, z: 96, h: 1.57, kind: 'sedan' },
  { x: 56, z: -48, h: -1.57, kind: 'coupe' },
  { x: -104, z: 48, h: 0, kind: 'suv' },
  { x: 104, z: 144, h: 3.14, kind: 'sedan' },
  { x: -152, z: -96, h: 1.57, kind: 'coupe' },
  { x: 152, z: -48, h: -1.57, kind: 'suv' },
  { x: -56, z: 192, h: 0, kind: 'sedan' },
];

export const PLAYER_START = { x: 0, z: 48, h: 0 };

export const HEALTH_PICKUPS = [
  { x: -48, z: 0 },
  { x: 96, z: 48 },
  { x: -144, z: 144 },
  { x: 48, z: -144 },
];

// Six story missions. A stage is one beat: go somewhere, enter a car,
// pick something up, take out a count of rivals, or ram a courier.
// Positions are road coordinates so markers are always reachable.
export const MISSIONS = [
  {
    id: 1, title: 'First Gear', payout: 500,
    briefing: 'Mara needs wheels. Grab a car — any car — and bring it to her garage.',
    stages: [
      { type: 'enterCar', text: 'Steal a car (walk up and press E)' },
      { type: 'goto', pos: { x: -96, z: -48 }, text: 'Drive to Mara\'s garage' },
    ],
  },
  {
    id: 2, title: 'Hot Wheels', payout: 800,
    briefing: 'A marked coupe is waiting uptown. Get it to the chop shop before the heat finds it.',
    stages: [
      { type: 'goto', pos: { x: -48, z: 96 }, text: 'Find the marked coupe' },
      { type: 'enterMarked', text: 'Get in the marked coupe' },
      { type: 'goto', pos: { x: 144, z: -144 }, time: 100, text: 'Deliver it to the chop shop' },
    ],
  },
  {
    id: 3, title: 'The Pickup', payout: 1200,
    briefing: 'A package is waiting on the pier. Mara\'s rivals know about it too.',
    stages: [
      { type: 'goto', pos: { x: 0, z: 216 }, text: 'Go to the pier' },
      { type: 'kill', count: 3, text: 'Deal with the ambush' },
      { type: 'pickup', pos: { x: 0, z: 224 }, text: 'Grab the package' },
      { type: 'goto', pos: { x: -96, z: -48 }, text: 'Deliver it to Mara' },
    ],
  },
  {
    id: 4, title: 'Payback', payout: 1500,
    briefing: 'The Vulture crew hit one of Mara\'s drivers. Hit them back, at the warehouse.',
    stages: [
      { type: 'goto', pos: { x: 144, z: 96 }, text: 'Go to the warehouse district' },
      { type: 'kill', count: 4, text: 'Take out the Vulture crew' },
    ],
  },
  {
    id: 5, title: 'Harbour Run', payout: 2000,
    briefing: 'A courier is moving Mara\'s money across town. Stop his car, take the briefcase.',
    stages: [
      { type: 'ram', text: 'Ram the courier\'s car until it stops' },
      { type: 'pickup', pos: { x: 0, z: 0 }, text: 'Grab the briefcase' },
      { type: 'goto', pos: { x: 48, z: 144 }, text: 'Deliver the briefcase to the south garage' },
    ],
  },
  {
    id: 6, title: 'Bridge Run', payout: 3000,
    briefing: 'Last job. The whole PD is on you — cross the north bridge and get the goods out.',
    stages: [
      { type: 'goto', pos: { x: 0, z: -252 }, text: 'Cross the north bridge — lose the cops or outrun them' },
    ],
  },
];

export const STORY_END = 'Mara wires the last payout and Port Meridian is yours. Jace Marlowe drove out over the bridge a free man — for now.';
