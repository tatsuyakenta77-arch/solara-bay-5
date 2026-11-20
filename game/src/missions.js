// Meridian Heat — story missions.
// One clear job: run the six-mission arc. Each mission is a list of stages;
// this manager watches the live game state, moves the gold marker, and
// fires events when stages and missions complete.
import * as THREE from 'three';
import { MISSIONS, STORY_END } from './config.js';

export class Missions {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events;
    this.index = 0;         // mission index (0-based)
    this.stageIdx = 0;
    this.killsNeeded = 0;
    this.killsDone = 0;
    this.timer = 0;
    this.done = false;
    this.failed = false;

    // Gold beacon: light column + floating diamond at the target.
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), mat);
    this.beacon.position.y = 30;
    this.scene.add(this.beacon);
    const dia = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, emissive: 0xffd23e, emissiveIntensity: 1 }),
    );
    dia.position.y = 7;
    this.diamond = dia;
    this.scene.add(dia);
    this.light = new THREE.PointLight(0xffd23e, 60, 40);
    this.light.position.y = 6;
    this.scene.add(this.light);
    this.hideMarker();
  }

  mission() { return MISSIONS[this.index]; }
  stage() { const m = this.mission(); return m ? m.stages[this.stageIdx] : null; }

  hideMarker() {
    this.beacon.visible = false;
    this.diamond.visible = false;
    this.light.visible = false;
    this.target = null;
  }

  showMarker(x, z) {
    this.target = { x, z };
    this.beacon.position.set(x, 30, z);
    this.diamond.position.set(x, 7, z);
    this.light.position.set(x, 6, z);
    this.beacon.visible = true;
    this.diamond.visible = true;
    this.light.visible = true;
  }

  startMission(i) {
    this.index = i;
    this.stageIdx = 0;
    this.killsDone = 0;
    this.failed = false;
    const m = this.mission();
    if (!m) { this.done = true; return; }
    this.events.onBanner(`MISSION ${m.id} — ${m.title}`);
    this.events.onObjective(m.title, m.briefing);
    this.startStage();
  }

  startStage() {
    const s = this.stage();
    if (!s) { this.completeMission(); return; }
    this.timer = s.time || 0;
    if (s.type === 'kill') { this.killsNeeded = s.count; this.killsDone = 0; }
    if (s.pos) this.showMarker(s.pos.x, s.pos.z);
    else if (s.type === 'kill' || s.type === 'ram' || s.type === 'enterCar' || s.type === 'enterMarked') this.hideMarker();
    this.events.onObjective(this.mission().title, s.text);
    if (this.events.onStageStart) this.events.onStageStart(s, this.mission());
  }

  // ctx: {x, z, inCar, inMarkedCar, courierStopped, kills}
  update(dt, ctx) {
    if (this.done || this.failed) return;
    const s = this.stage();
    if (!s) return;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.failed = true;
        this.events.onFail('Out of time — the job fell through.');
        return;
      }
    }
    this.diamond.rotation.y += dt * 1.6;
    this.diamond.position.y = 7 + Math.sin(performance.now() / 300) * 0.5;
    if (s.type === 'kill') this.killsDone = ctx.kills || 0;
    let done = false;
    switch (s.type) {
      case 'enterCar': done = !!ctx.inCar; break;
      case 'enterMarked': done = !!ctx.inMarkedCar; break;
      case 'goto':
      case 'pickup':
        if (s.pos) done = Math.hypot(ctx.x - s.pos.x, ctx.z - s.pos.z) < 6;
        break;
      case 'kill': done = this.killsDone >= this.killsNeeded; break;
      case 'ram': done = !!ctx.courierStopped; break;
    }
    if (done) {
      this.stageIdx++;
      if (this.stageIdx >= this.mission().stages.length) this.completeMission();
      else this.startStage();
    }
  }

  completeMission() {
    const m = this.mission();
    this.events.onMissionComplete(m);
    this.index++;
    if (this.index >= MISSIONS.length) {
      this.done = true;
      this.hideMarker();
      this.events.onAllComplete(STORY_END);
    } else {
      this.startMission(this.index);
    }
  }

  restart() {
    this.failed = false;
    this.startMission(this.index);
  }

  setStagePos(x, z) {
    const s = this.stage();
    if (s) { s.pos = { x, z }; this.showMarker(x, z); }
  }

  timeLeft() { return this.timer; }
}
