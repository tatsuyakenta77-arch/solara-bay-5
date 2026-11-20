// Meridian Heat — automated playtest (dev tool, not part of the entry).
// Serves game/ on :8902, drives, steals, completes all 6 missions, tests
// police pursuit, combat, pause and save/continue, and captures 4
// screenshots. Exits non-zero on any failure.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const SHOTS = 'screenshots';
mkdirSync(SHOTS, { recursive: true });
const errors = [];
const log = (...a) => console.log('[playtest]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) { errors.push(msg); console.error('FAIL:', msg); }
  else log('ok:', msg);
};

const server = spawn('node', ['serve.ts', '--port', '8902'], { cwd: process.cwd(), stdio: 'pipe' });
await sleep(1500);

const browser = await chromium.launch({
  headless: true,
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1181/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url()));

const st = async () => page.evaluate(() => window.__MH.state);
const dbg = async (expr) => page.evaluate(expr);
const key = async (code, ms) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); };
// Hold a key until a state condition is true (headless swiftshader runs
// far below 60fps, so fixed sleeps are unreliable here).
const holdUntil = async (code, cond, timeout = 30000, label = 'condition') => {
  await page.keyboard.down(code);
  try {
    return await waitFor(cond, timeout, label);
  } finally {
    await page.keyboard.up(code);
  }
};
const shot = async (path) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(600);
  await page.screenshot({ path, type: 'jpeg', quality: 82 });
  await page.setViewportSize({ width: 960, height: 540 });
  await sleep(300);
};
const waitFor = async (fn, timeout = 15000, label = 'condition') => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await sleep(200);
  }
  errors.push('timeout: ' + label);
  console.error('FAIL: timeout:', label);
  return false;
};

try {
  await page.goto('http://localhost:8902/', { waitUntil: 'load', timeout: 20000 });
  await sleep(3000);
  assert(await page.evaluate(() => !!window.__MH), '__MH hook present, game booted');
  assert((await st()).mode === 'menu', 'menu shows at boot');

  // New game, on foot.
  await page.click('#btnNew');
  await sleep(1000);
  let s = await st();
  assert(s.mode === 'playing', `mode playing (got ${s.mode})`);
  assert(s.mission === 'First Gear', `mission 1 active (got ${s.mission})`);
  await holdUntil('KeyW', async () => (await st()).z > 50, 20000, 'player walks');
  s = await st();
  assert(Math.abs(s.z - 48) > 2 || Math.abs(s.x) > 2, 'player walks');
  await shot(`${SHOTS}/4-street.jpg`);

  // Steal the starter car and drive.
  await dbg(`window.__MH.debug.teleport(10, 32)`);
  await sleep(300);
  await page.keyboard.press('KeyE');
  await sleep(400);
  s = await st();
  assert(s.inCar, 'entered a car');
  await holdUntil('KeyW', async () => Math.abs((await st()).speed) > 5, 20000, 'car drives');
  s = await st();
  assert(Math.abs(s.speed) > 5, `car drives (speed ${s.speed.toFixed(1)})`);
  // Cover shot: long straight run down the main north-south road, skyline ahead.
  await dbg(`window.__MH.debug.teleport(0, 120, ${Math.PI})`);
  await holdUntil('KeyW', async () => Math.abs((await st()).speed) > 8, 20000, 'cover run');
  await shot(`${SHOTS}/1-cover.jpg`);

  // Mission 1: deliver to Mara's garage.
  await dbg(`window.__MH.debug.teleport(-92, -48)`);
  await waitFor(async () => (await st()).mission === 'Hot Wheels', 8000, 'mission 2 starts');
  s = await st();
  assert(s.mission === 'Hot Wheels', 'mission 2 active');
  assert(s.cash >= 500, `mission 1 payout (cash $${s.cash})`);

  // Mission 2: get the marked coupe, then deliver it.
  await dbg(`window.__MH.debug.teleport(-48, 99)`);
  await sleep(300);
  await page.keyboard.press('KeyE'); // exit current car
  await sleep(300);
  await dbg(`window.__MH.debug.teleport(-48, 97)`); // step to the marked coupe
  await sleep(200);
  await page.keyboard.press('KeyE'); // enter marked coupe
  await sleep(400);
  s = await st();
  assert(s.inCar, 'entered marked coupe');
  await dbg(`window.__MH.debug.teleport(140, -144)`);
  await waitFor(async () => (await st()).mission === 'The Pickup', 8000, 'mission 3 starts');
  assert((await st()).mission === 'The Pickup', 'mission 3 active');

  // Save / continue: reload mid-game, Continue resumes mission 3 with the cash kept.
  await page.reload({ waitUntil: 'load' });
  await sleep(2500);
  const contVisible = await page.isVisible('#btnContinue');
  assert(contVisible, 'Continue button offered after reload');
  await page.click('#btnContinue');
  await sleep(1000);
  s = await st();
  assert(s.mode === 'playing', 'continue resumes play');
  assert(s.mission === 'The Pickup', 'continue resumes mission 3');
  assert(s.cash >= 1300, `save kept the cash ($${s.cash})`);

  // Mission 3: pier ambush, then deliver.
  await dbg(`window.__MH.debug.teleport(0, 212)`);
  await sleep(600);
  s = await st();
  assert(s.enemies >= 3, `ambush spawned (${s.enemies} enemies)`);
  await page.keyboard.press('KeyE'); // exit car to fight on foot
  await sleep(300);
  await dbg(`window.__MH.debug.killAll()`);
  await sleep(800);
  await dbg(`window.__MH.debug.teleport(0, 224)`);
  await waitFor(async () => (await st()).stage === 'goto', 8000, 'pickup stage done');
  await dbg(`window.__MH.debug.teleport(-92, -48)`);
  await waitFor(async () => (await st()).mission === 'Payback', 8000, 'mission 4 starts');
  assert((await st()).mission === 'Payback', 'mission 4 active');

  // Mission 4: warehouse shootout (mission screenshot here).
  await dbg(`window.__MH.debug.teleport(140, 92)`);
  await sleep(800);
  s = await st();
  assert(s.enemies >= 4, `warehouse crew spawned (${s.enemies})`);
  // Shoot once to prove the pistol works.
  const magBefore = s.mag;
  await page.mouse.click(640, 360);
  await sleep(300);
  s = await st();
  assert(s.mag === magBefore - 1, `pistol fires (mag ${magBefore} -> ${s.mag})`);
  await shot(`${SHOTS}/3-mission.jpg`);
  await dbg(`window.__MH.debug.killAll()`);
  await waitFor(async () => (await st()).mission === 'Harbour Run', 8000, 'mission 5 starts');
  assert((await st()).mission === 'Harbour Run', 'mission 5 active');

  // Mission 5: get in a car, ram the courier for real, then stop it.
  await dbg(`window.__MH.debug.teleport(104, 142)`);
  await sleep(300);
  await page.keyboard.press('KeyE'); // steal the parked sedan nearby
  await sleep(400);
  s = await st();
  assert(s.inCar, 'in a car for the chase');
  // Chase the courier down and ram it: teleport in behind it, on its
  // heading, so the faster player car runs it down from behind.
  let rammed = false;
  for (let attempt = 0; attempt < 3 && !rammed; attempt++) {
    s = await st();
    const co = s.courier;
    if (!co) break;
    const behind = { x: co.x - Math.sin(co.heading) * 12, z: co.z - Math.cos(co.heading) * 12 };
    await dbg(`window.__MH.debug.teleport(${behind.x}, ${behind.z}, ${co.heading})`);
    await holdUntil('KeyW', async () => {
      const cur = await st();
      return !cur.courier || cur.courier.health < 100;
    }, 60000, 'ram connects');
    s = await st();
    if (s.courier && s.courier.health < 100) rammed = true;
  }
  assert(rammed, 'ramming the courier damages it');
  await dbg(`window.__MH.debug.damageCourier(100)`);
  await sleep(500);
  // Go to the briefcase (where the courier stopped), then deliver it.
  s = await st();
  if (s.courier) {
    await dbg(`window.__MH.debug.teleport(${s.courier.x}, ${s.courier.z})`);
  }
  await waitFor(async () => (await st()).stage === 'goto', 15000, 'briefcase stage');
  s = await st();
  await dbg(`window.__MH.debug.teleport(${s.x}, ${s.z})`);
  await sleep(300);
  await dbg(`window.__MH.debug.teleport(48, 141)`);
  await waitFor(async () => (await st()).mission === 'Bridge Run', 8000, 'mission 6 starts');
  assert((await st()).mission === 'Bridge Run', 'mission 6 active');

  // Police pursuit + chase screenshot.
  await dbg(`window.__MH.debug.setWanted(3)`);
  await waitFor(async () => (await st()).police.length >= 2, 10000, 'police respond');
  s = await st();
  assert(s.wanted === 3, `wanted 3 stars (got ${s.wanted})`);
  assert(s.police.length >= 2, `${s.police.length} police units chasing`);
  // Chase shot: put the nearest police unit in frame — park the player car
  // ahead of it, facing back at it, so it drives into view head-on.
  const pu = s.police[0];
  const pdx = pu.x - s.x, pdz = pu.z - s.z;
  const pdist = Math.hypot(pdx, pdz) || 1;
  const parkX = pu.x - (pdx / pdist) * 30;
  const parkZ = pu.z - (pdz / pdist) * 30;
  const faceHeading = Math.atan2(pdx, pdz);
  await dbg(`window.__MH.debug.teleport(${parkX}, ${parkZ}, ${faceHeading})`);
  await holdUntil('KeyW', async () => Math.abs((await st()).speed) > 8, 20000, 'fleeing');
  await shot(`${SHOTS}/2-chase.jpg`);

  // Pause / resume.
  await page.keyboard.press('Escape');
  await sleep(400);
  assert((await st()).mode === 'paused', 'pause works');
  await page.keyboard.press('Escape');
  await sleep(400);
  assert((await st()).mode === 'playing', 'resume works');

  // Mission 6: cross the bridge -> win.
  await dbg(`window.__MH.debug.teleport(0, -248)`);
  await waitFor(async () => (await st()).mode === 'won', 10000, 'win screen');
  s = await st();
  assert(s.mode === 'won', 'game won');
  assert(s.cash >= 7500, `final take $${s.cash}`);
} catch (e) {
  errors.push('exception: ' + (e && e.message));
  console.error('EXCEPTION:', e);
} finally {
  await browser.close();
  server.kill();
}

if (errors.length) {
  console.error(`\nPLAYTEST FAILED: ${errors.length} error(s)`);
  process.exit(1);
}
console.log('\nPLAYTEST PASSED: all checks green, 0 console/page errors');
