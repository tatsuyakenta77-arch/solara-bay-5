// Meridian Heat — game orchestration.
// One clear job: boot the scene, own the player, the wanted system and the
// save, run the frame loop, and wire the menus. Subsystems do the rest.
import * as THREE from 'three';
import { WORLD, TUNING, COLORS, PARKED_CARS, PLAYER_START, HEALTH_PICKUPS, MISSIONS } from './config.js';
import { buildWorld } from './world.js';
import { AudioSys } from './audio.js';
import { makeCarMesh, Car, Traffic, Police, collideCircle, inWater } from './vehicles.js';
import { Pedestrians } from './peds.js';
import { Particles, Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- boot ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 12, -18);

const audio = new AudioSys();
const hud = new HUD();
const world = buildWorld(scene);
const particles = new Particles(scene);
const traffic = new Traffic(scene, world.colliders, 10);
const peds = new Pedestrians(scene, world.colliders, 14);
const police = new Police(scene, world.colliders);
const combat = new Combat(scene);
combat.spawnPickups(HEALTH_PICKUPS);

// ---------- state ----------
const S = {
  mode: 'menu',           // menu | playing | paused | busted | wasted | won
  cash: 0,
  health: TUNING.playerHealth,
  mag: TUNING.pistolMag,
  reserve: TUNING.pistolReserve,
  heat: 0,
  wanted: 0,
  kills: 0,               // kills in the current kill stage
  clockMin: 540,
  muted: false,
  inCar: null,
  markedCar: null,
  courier: null,
  courierStopped: false,
  bustT: 0,
  lastCrimeT: -99,
  elapsed: 0,
  shootCool: 0,
  meleeCool: 0,
  saveT: 0,
};

// Player on foot.
function makePlayerMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, 1.05, 8),
    new THREE.MeshStandardMaterial({ color: COLORS.player, roughness: 0.85 }),
  );
  body.position.y = 0.85;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.8 }),
  );
  head.position.y = 1.62;
  g.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.6 }),
  );
  gun.position.set(0.3, 1.05, 0.45);
  g.add(gun);
  return g;
}
const player = {
  mesh: makePlayerMesh(),
  x: PLAYER_START.x, z: PLAYER_START.z,
  heading: PLAYER_START.h,
  vy: 0, y: 0,
};
scene.add(player.mesh);

// Parked cars the player can steal.
const parked = [];
for (const p of PARKED_CARS) {
  const color = COLORS.carBody[Math.floor(Math.random() * COLORS.carBody.length)];
  const mesh = makeCarMesh(color, p.kind);
  scene.add(mesh);
  parked.push(new Car(mesh, p.x, p.z, p.h, color));
}

// Camera rig.
const cam = { yaw: 0, pitch: 0.32, dist: 11, shake: 0 };

// ---------- missions ----------
let missionKillsAtStageStart = 0;
const missions = new Missions(scene, {
  onBanner: (t) => hud.showBanner(t),
  onObjective: (t, x) => hud.setObjective(t, x),
  onStageStart: (stage) => {
    if (stage.type === 'kill') {
      const base = missions.mission().id === 3 ? { x: 0, z: 214 } : { x: 144, z: 96 };
      const spots = [
        { x: base.x + 6, z: base.z }, { x: base.x - 6, z: base.z + 4 },
        { x: base.x + 2, z: base.z - 7 }, { x: base.x - 3, z: base.z - 3 },
      ];
      const list = spots.slice(0, stage.count || 3);
      combat.spawnEnemies(list);
      missionKillsAtStageStart = S.kills;
    }
    if (stage.type === 'enterMarked' || (stage.type === 'goto' && missions.mission().id === 2 && missions.stageIdx === 0)) {
      if (!S.markedCar) {
        const mesh = makeCarMesh(0xffd23e, 'coupe');
        scene.add(mesh);
        S.markedCar = new Car(mesh, -48, 96, 1.57, 0xffd23e);
      }
    }
    if (stage.type === 'ram' && !S.courier) {
      const mesh = makeCarMesh(0x8e44ad, 'sedan');
      scene.add(mesh);
      const c = new Car(mesh, 48, 0, 0, 0x8e44ad);
      c.health = 100;
      S.courier = c;
      S.courierStopped = false;
    }
    if (missions.mission().id === 6 && missions.stageIdx === 0) {
      addHeat(3 * TUNING.heatPerStar);
    }
  },
  onMissionComplete: (m) => {
    S.cash += m.payout;
    audio.jingle();
    hud.showBanner(`JOB DONE — +$${m.payout}`);
    hud.showToast(`${m.title} complete. Mara wired $${m.payout}.`);
    saveGame();
  },
  onAllComplete: (text) => {
    S.mode = 'won';
    audio.jingle();
    // Restart point for a later Continue: back at the apartment, so the
    // final mission replays from its start instead of instantly re-winning.
    player.x = PLAYER_START.x;
    player.z = PLAYER_START.z;
    showEnd('PORT MERIDIAN IS YOURS', text + ` Final take: $${S.cash.toLocaleString('en-US')}.`);
    saveGame();
  },
  onFail: (reason) => {
    hud.showToast(reason + ' Restarting the mission.');
    audio.busted();
    missions.restart();
  },
});

// ---------- wanted ----------
function addHeat(n) {
  S.heat = Math.min(TUNING.maxStars * TUNING.heatPerStar, S.heat + n);
  S.lastCrimeT = S.elapsed;
  const stars = Math.min(TUNING.maxStars, Math.floor(S.heat / TUNING.heatPerStar));
  if (stars !== S.wanted) {
    S.wanted = stars;
    police.setCount(stars, player.x, player.z);
    audio.siren(stars > 0);
  }
}

function updateWanted(dt) {
  if (S.elapsed - S.lastCrimeT > 6 && S.heat > 0) {
    S.heat = Math.max(0, S.heat - TUNING.heatDecay * dt);
    const stars = Math.floor(S.heat / TUNING.heatPerStar);
    if (stars !== S.wanted) {
      S.wanted = stars;
      police.setCount(stars, player.x, player.z);
      audio.siren(stars > 0);
    }
  }
}

// ---------- input ----------
const keys = {};
let dragging = false, lastMX = 0, lastMY = 0;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyM') { S.muted = !S.muted; audio.setMuted(S.muted); hud.showToast(S.muted ? 'Muted' : 'Sound on'); }
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'KeyF') melee();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => { dragging = true; lastMX = e.clientX; lastMY = e.clientY; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  cam.yaw -= (e.clientX - lastMX) * 0.005;
  cam.pitch = clamp(cam.pitch + (e.clientY - lastMY) * 0.004, 0.08, 1.1);
  lastMX = e.clientX; lastMY = e.clientY;
});
window.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + e.deltaY * 0.01, 6, 18); }, { passive: true });
canvas.addEventListener('click', () => { if (S.mode === 'playing' && !S.inCar) shoot(); });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function reload() {
  if (S.mode !== 'playing' || S.inCar) return;
  if (S.mag >= TUNING.pistolMag || S.reserve <= 0) return;
  const need = TUNING.pistolMag - S.mag;
  const take = Math.min(need, S.reserve);
  S.mag += take; S.reserve -= take;
  audio.click();
}

function shoot() {
  if (S.shootCool > 0 || S.mag <= 0) return;
  S.shootCool = 0.18;
  S.mag--;
  audio.shot();
  addHeat(TUNING.heatPerShot);
  peds.scare(player.x, player.z, 30);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  const hit = combat.shoot(origin, dir, (e) => {
    particles.burst(e.x, 1.2, e.z, 0xff3333, 12, 5, 2);
    audio.hit();
    if (e.health <= 0) {
      S.kills++;
      addHeat(TUNING.heatPerKill / 2);
      particles.burst(e.x, 1.2, e.z, 0xffdd33, 18, 7, 3);
    }
  });
  // Muzzle flash + tracer dust at the camera.
  particles.burst(origin.x + dir.x * 2, origin.y + dir.y * 2, origin.z + dir.z * 2, 0xffdd66, 5, 2, 1);
  if (!hit) {
    // Bullet impact puff far ahead.
    const px = origin.x + dir.x * 40, pz = origin.z + dir.z * 40;
    particles.burst(px, 1, pz, 0x999999, 4, 2, 1);
  }
  cam.shake = Math.max(cam.shake, 0.12);
}

function melee() {
  if (S.mode !== 'playing' || S.inCar || S.meleeCool > 0) return;
  S.meleeCool = 0.45;
  audio.melee();
  combat.melee(player.x, player.z, player.heading, (e) => {
    particles.burst(e.x, 1.2, e.z, 0xff3333, 10, 5, 2);
    if (e.health <= 0) { S.kills++; addHeat(TUNING.heatPerKill / 2); }
  });
}

function nearestCar(x, z, maxD) {
  let best = null, bestD = maxD;
  const consider = (c) => {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) { bestD = d; best = c; }
  };
  for (const c of parked) consider(c);
  if (S.markedCar) consider(S.markedCar);
  return best;
}

function tryEnterExitCar() {
  if (S.mode !== 'playing') return;
  audio.resume();
  if (S.inCar) {
    const c = S.inCar;
    const side = { x: c.x + Math.cos(c.heading) * 2.6, z: c.z - Math.sin(c.heading) * 2.6 };
    const fixed = collideCircle(side.x, side.z, 0.6, world.colliders);
    player.x = fixed.x; player.z = fixed.z;
    player.heading = c.heading;
    player.mesh.visible = true;
    S.inCar = null;
    audio.engineOff();
    return;
  }
  const car = nearestCar(player.x, player.z, 4);
  if (!car) return;
  S.inCar = car;
  player.mesh.visible = false;
  addHeat(TUNING.heatPerSteal);
  hud.showToast('Car stolen — the PD noticed.');
  audio.horn();
  const idx = parked.indexOf(car);
  if (idx >= 0) parked.splice(idx, 1);
}

// ---------- save ----------
function saveGame() {
  try {
    localStorage.setItem(TUNING.saveKey, JSON.stringify({
      cash: S.cash, health: S.health, mag: S.mag, reserve: S.reserve,
      missionIdx: missions.index,
      x: S.inCar ? S.inCar.x : player.x,
      z: S.inCar ? S.inCar.z : player.z,
    }));
  } catch { /* storage unavailable — play on without saving */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(TUNING.saveKey);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function hasSave() { return !!loadSave(); }

// ---------- menus ----------
function showMenu() {
  S.mode = 'menu';
  $('menu').classList.remove('hidden');
  $('pause').classList.add('hidden');
  $('endcard').classList.add('hidden');
  hud.hide();
  police.clear();
  audio.siren(false);
  audio.engineOff();
  $('btnContinue').classList.toggle('hidden', !hasSave());
}

function startGame(fresh) {
  audio.resume();
  audio.click();
  const save = fresh ? null : loadSave();
  S.cash = save ? save.cash : 0;
  S.health = save ? save.health : TUNING.playerHealth;
  S.mag = save ? save.mag : TUNING.pistolMag;
  S.reserve = save ? save.reserve : TUNING.pistolReserve;
  S.heat = 0; S.wanted = 0; S.kills = 0;
  player.x = save ? save.x : PLAYER_START.x;
  player.z = save ? save.z : PLAYER_START.z;
  player.heading = 0;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  S.inCar = null;
  police.setCount(0, 0, 0);
  $('menu').classList.add('hidden');
  $('endcard').classList.add('hidden');
  hud.show();
  S.mode = 'playing';
  missions.startMission(save ? Math.min(save.missionIdx, MISSIONS.length - 1) : 0);
  hud.setObjective(missions.mission().title, missions.mission().briefing);
}

function togglePause() {
  if (S.mode === 'playing') {
    S.mode = 'paused';
    $('pause').classList.remove('hidden');
  } else if (S.mode === 'paused') {
    S.mode = 'playing';
    $('pause').classList.add('hidden');
  }
}

function showEnd(title, text) {
  $('endTitle').textContent = title;
  $('endText').textContent = text;
  $('endcard').classList.remove('hidden');
  hud.hide();
}

function bustOrWaste(kind) {
  const loss = kind === 'busted' ? Math.min(300, Math.floor(S.cash * 0.1) + 50) : 300;
  S.cash = Math.max(0, S.cash - loss);
  S.health = TUNING.playerHealth;
  S.heat = 0; S.wanted = 0; S.bustT = 0;
  police.setCount(0, 0, 0);
  audio.siren(false);
  audio.busted();
  player.x = 0; player.z = 48;
  player.mesh.visible = true;
  if (S.inCar) { S.inCar = null; }
  S.mode = kind;
  showEnd(kind === 'busted' ? 'BUSTED' : 'WASTED',
    kind === 'busted'
      ? `The PD caught you. They took $${loss} and dropped you back downtown.`
      : `You went down. The hospital patched you up for $${loss}.`);
  missions.restart();
}

$('btnNew').addEventListener('click', () => startGame(true));
$('btnContinue').addEventListener('click', () => startGame(false));
$('btnHow').addEventListener('click', () => { $('howto').classList.toggle('hidden'); audio.click(); });
$('btnResume').addEventListener('click', () => togglePause());
$('btnRestart').addEventListener('click', () => { $('pause').classList.add('hidden'); missions.restart(); S.mode = 'playing'; });
$('btnQuit').addEventListener('click', () => showMenu());
$('btnEndRetry').addEventListener('click', () => { $('endcard').classList.add('hidden'); S.mode = 'playing'; hud.show(); missions.restart(); });
$('btnEndMenu').addEventListener('click', () => showMenu());

// ---------- per-frame ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();

function updatePlayer(dt) {
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const speed = sprint ? TUNING.sprintSpeed : TUNING.walkSpeed;
  let mx = 0, mz = 0;
  const fwd = { x: Math.sin(cam.yaw), z: Math.cos(cam.yaw) };
  const right = { x: Math.cos(cam.yaw), z: -Math.sin(cam.yaw) };
  if (keys.KeyW) { mx += fwd.x; mz += fwd.z; }
  if (keys.KeyS) { mx -= fwd.x; mz -= fwd.z; }
  if (keys.KeyD) { mx += right.x; mz += right.z; }
  if (keys.KeyA) { mx -= right.x; mz -= right.z; }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    player.heading = Math.atan2(mx, mz);
    const nx = player.x + mx * speed * dt;
    const nz = player.z + mz * speed * dt;
    const fixed = collideCircle(nx, nz, 0.55, world.colliders);
    if (!inWater(fixed.x, fixed.z)) { player.x = fixed.x; player.z = fixed.z; }
    player.x = clamp(player.x, -258, 258);
    player.z = clamp(player.z, -258, 262);
    // Walking bob.
    player.mesh.position.y = Math.abs(Math.sin(S.elapsed * 10)) * 0.08;
  } else {
    player.mesh.position.y = 0;
  }
  if (keys.Space && player.y === 0) { player.vy = 5.2; }
  if (player.y > 0 || player.vy !== 0) {
    player.vy -= 16 * dt;
    player.y += player.vy * dt;
    if (player.y <= 0) { player.y = 0; player.vy = 0; }
    player.mesh.position.y = player.y + (len > 0 ? Math.abs(Math.sin(S.elapsed * 10)) * 0.08 : 0);
  }
  player.mesh.position.set(player.x, player.mesh.position.y, player.z);
  player.mesh.rotation.y = player.heading;
}

function updateCar(dt) {
  const c = S.inCar;
  const throttle = (keys.KeyW ? 1 : 0) + (keys.KeyS ? -0.8 : 0);
  const steer = (keys.KeyA ? -1 : 0) + (keys.KeyD ? 1 : 0);
  const brake = keys.Space ? 1 : 0;
  const hitWall = c.drive(dt, throttle, steer, brake, world.colliders);
  if (hitWall && Math.abs(c.speed) > 6) {
    audio.crash();
    particles.burst(c.x, 0.8, c.z, 0xffcc33, 10, 5, 2);
    cam.shake = 0.25;
  }
  // Hit pedestrians.
  const near = peds.nearest(c.x, c.z, 2.4);
  if (near && Math.abs(c.speed) > 6) {
    const i = peds.peds.indexOf(near.ped);
    if (i >= 0) {
      scene.remove(near.ped.mesh);
      peds.peds.splice(i, 1);
      addHeat(TUNING.heatPerPedHit);
      audio.crash();
      particles.burst(near.ped.x, 1, near.ped.z, 0xff5555, 12, 5, 3);
      hud.showToast('Pedestrian hit — the heat is on.');
    }
  }
  // Bump traffic cars.
  for (const t of traffic.cars) {
    const d = Math.hypot(t.x - c.x, t.z - c.z);
    if (d < 3.4 && Math.abs(c.speed) > 4) {
      c.speed *= 0.45;
      audio.crash();
      particles.burst(c.x, 0.8, c.z, 0xffcc33, 8, 4, 2);
    }
  }
  // Courier ramming (mission 5).
  if (S.courier && !S.courierStopped) {
    const co = S.courier;
    const d = Math.hypot(co.x - c.x, co.z - c.z);
    if (d < 3.6 && Math.abs(c.speed) > 7) {
      co.health -= 26;
      c.speed *= 0.5;
      audio.crash();
      particles.burst(co.x, 1, co.z, 0xff9933, 16, 7, 3);
      cam.shake = 0.35;
      if (co.health <= 0) {
        co.stopped = true;
        S.courierStopped = true;
        S.briefcasePos = { x: co.x, z: co.z };
        hud.showToast('Courier stopped — grab the briefcase.');
      }
    }
  }
  audio.setEngine(0.05, clamp(Math.abs(c.speed) / TUNING.carMaxSpeed, 0, 1));
}

function updateCourier(dt) {
  const co = S.courier;
  if (!co || S.courierStopped) return;
  // Flee from where the player actually is (the car, when driving).
  const px = S.inCar ? S.inCar.x : player.x;
  const pz = S.inCar ? S.inCar.z : player.z;
  const dx = co.x - px, dz = co.z - pz;
  const dist = Math.hypot(dx, dz) || 1;
  const want = Math.atan2(dx, dz);
  let dh = want - co.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  co.drive(dt, 1, clamp(dh * 1.8, -1, 1), 0, world.colliders);
  // The courier is slower than the player's top speed, so a determined
  // chase can catch it — but it still takes a few good hits to stop.
  if (Math.abs(co.speed) > 30) co.speed = Math.sign(co.speed) * 30;
}

function updatePolice(dt) {
  if (S.wanted <= 0) return;
  const px = S.inCar ? S.inCar.x : player.x;
  const pz = S.inCar ? S.inCar.z : player.z;
  const ps = S.inCar ? Math.abs(S.inCar.speed) : 0;
  police.update(dt, px, pz, ps);
  // Ram + bust.
  for (const u of police.units) {
    const c = u.car;
    const d = Math.hypot(c.x - px, c.z - pz);
    if (d < 3.2) {
      if (S.inCar) {
        S.inCar.speed *= 0.82;
        if (Math.abs(S.inCar.speed) > 10) { audio.crash(); particles.burst(px, 1, pz, 0x88aaff, 8, 4, 2); }
      }
      S.bustT += dt;
      if (S.bustT > TUNING.bustTime) { bustOrWaste('busted'); return; }
    }
  }
  if (S.bustT > 0) S.bustT = Math.max(0, S.bustT - dt * 2);
}

function updateCamera(dt) {
  const px = S.inCar ? S.inCar.x : player.x;
  const pz = S.inCar ? S.inCar.z : player.z;
  const heading = S.inCar ? S.inCar.heading : cam.yaw;
  // Trailing camera: behind the heading, easing toward it.
  const targetYaw = S.inCar ? heading + Math.PI : cam.yaw;
  let dy = targetYaw - cam.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  if (S.inCar) cam.yaw += dy * Math.min(1, dt * 1.6);
  const cx = px - Math.sin(cam.yaw) * cam.dist * Math.cos(cam.pitch);
  const cz = pz - Math.cos(cam.yaw) * cam.dist * Math.cos(cam.pitch);
  const cy = 2.2 + cam.dist * Math.sin(cam.pitch);
  camera.position.lerp(tmpV.set(cx, cy, cz), Math.min(1, dt * 6));
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt);
    camera.position.x += (Math.random() - 0.5) * cam.shake;
    camera.position.y += (Math.random() - 0.5) * cam.shake;
  }
  camera.lookAt(px, 1.6, pz);
}

function hintText() {
  if (S.inCar) {
    if (S.markedCar && S.inCar === S.markedCar) return 'Marked car — deliver it.';
    return 'E — exit car · Space — handbrake';
  }
  const car = nearestCar(player.x, player.z, 4);
  if (car) return 'E — steal car';
  const nearPickup = combat.pickups.some((p) => !p.taken && Math.hypot(p.x - player.x, p.z - player.z) < 2.2);
  if (nearPickup) return '';
  if (S.mag === 0) return 'R — reload';
  return 'WASD — move · Click — shoot · F — melee';
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (S.mode === 'playing') {
    S.elapsed += dt;
    S.clockMin += dt * 0.6;
    S.shootCool = Math.max(0, S.shootCool - dt);
    S.meleeCool = Math.max(0, S.meleeCool - dt);
    if (S.inCar) updateCar(dt); else updatePlayer(dt);
    updateCourier(dt);
    traffic.update(dt);
    const effX = S.inCar ? S.inCar.x : player.x;
    const effZ = S.inCar ? S.inCar.z : player.z;
    peds.update(dt, effX, effZ, S.inCar ? Math.abs(S.inCar.speed) : 0, !!S.inCar);
    combat.update(dt, effX, effZ, camera,
      (e) => { audio.enemyShot(); particles.burst(e.x, 1.3, e.z, 0xffdd66, 4, 3, 1); },
      (dmg) => {
        S.health -= dmg;
        particles.burst(effX, 1.2, effZ, 0xff3333, 8, 4, 2);
        if (S.health <= 0) { bustOrWaste('wasted'); return; }
      });
    const pk = S.health < TUNING.playerHealth ? combat.pickupNear(player.x, player.z, 2.2) : null;
    if (pk) {
      S.health = Math.min(TUNING.playerHealth, S.health + 40);
      audio.pickup();
      hud.showToast('+40 HP');
    }
    updateWanted(dt);
    updatePolice(dt);
    if (S.mode !== 'playing') { renderer.render(scene, camera); return; }
    missions.update(dt, {
      x: S.inCar ? S.inCar.x : player.x,
      z: S.inCar ? S.inCar.z : player.z,
      inCar: !!S.inCar,
      inMarkedCar: S.inCar === S.markedCar,
      courierStopped: S.courierStopped,
      kills: S.kills - missionKillsAtStageStart,
    });
    // Mission 5's briefcase drops where the courier stopped; point the
    // pickup stage at that spot once the stage turns over.
    const cur = missions.stage();
    if (cur && cur.type === 'pickup' && S.briefcasePos && cur.pos && cur.pos.x === 0 && cur.pos.z === 0) {
      missions.setStagePos(S.briefcasePos.x, S.briefcasePos.z);
    }
    // Marked car beacon follows it.
    if (S.markedCar && missions.mission() && missions.mission().id === 2 && missions.stageIdx === 0) {
      missions.showMarker(S.markedCar.x, S.markedCar.z);
    }
    S.saveT += dt;
    if (S.saveT > 15) { S.saveT = 0; saveGame(); }
    hud.update({
      cash: S.cash, health: S.health, mag: S.mag, reserve: S.reserve,
      speed: S.inCar ? S.inCar.speed : 0, wanted: S.wanted,
      clockMin: S.clockMin, hint: hintText(),
      x: S.inCar ? S.inCar.x : player.x,
      z: S.inCar ? S.inCar.z : player.z,
      heading: S.inCar ? S.inCar.heading : player.heading,
      target: missions.target,
      enemies: combat.enemies.map((e) => ({ x: e.x, z: e.z })),
      police: police.units.map((u) => ({ x: u.car.x, z: u.car.z })),
      traffic: traffic.cars.map((c) => ({ x: c.x, z: c.z })),
    });
  } else if (S.mode === 'menu') {
    // Slow orbit around the city behind the menu.
    const t = S.elapsed + performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.05) * 150, 70, Math.cos(t * 0.05) * 150);
    camera.lookAt(0, 0, 40);
    traffic.update(dt);
    peds.update(dt, 9999, 9999, 0, false);
  }
  particles.update(dt);
  if (S.mode === 'playing') updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------- debug hook (used by the automated playtest) ----------
window.__MH = {
  get state() {
    return {
      mode: S.mode,
      mission: missions.mission() ? missions.mission().title : null,
      missionIdx: missions.index,
      stage: missions.stage() ? missions.stage().type : null,
      cash: S.cash,
      health: Math.round(S.health),
      mag: S.mag,
      reserve: S.reserve,
      wanted: S.wanted,
      heat: Math.round(S.heat),
      speed: S.inCar ? S.inCar.speed : 0,
      x: S.inCar ? S.inCar.x : player.x,
      z: S.inCar ? S.inCar.z : player.z,
      inCar: !!S.inCar,
      kills: S.kills,
      enemies: combat.enemies.length,
      police: police.units.length,
      courier: S.courier ? { x: Math.round(S.courier.x), z: Math.round(S.courier.z), heading: S.courier.heading, health: Math.round(S.courier.health) } : null,
    };
  },
  debug: {
    setWanted(n) { S.heat = n * TUNING.heatPerStar; S.lastCrimeT = S.elapsed; addHeat(0); },
    teleport(x, z, heading) {
      player.x = x; player.z = z;
      if (typeof heading === 'number') player.heading = heading;
      if (S.inCar) {
        S.inCar.x = x; S.inCar.z = z;
        if (typeof heading === 'number') S.inCar.heading = heading;
      }
    },
    giveCash(n) { S.cash += n; },
    setHealth(n) { S.health = n; },
    startMission(i) { missions.startMission(i); },
    killAll() { for (const e of [...combat.enemies]) { if (e.health > 0) { e.health = 0; S.kills++; } } },
    damageCourier(n) {
      if (!S.courier || S.courierStopped) return;
      S.courier.health -= n;
      if (S.courier.health <= 0) {
        S.courier.stopped = true;
        S.courierStopped = true;
        S.briefcasePos = { x: S.courier.x, z: S.courier.z };
      }
    },
    skipStage() { missions.stageIdx++; missions.startStage(); },
    enterNearestCar() { tryEnterExitCar(); },
  },
};

showMenu();
frame();
