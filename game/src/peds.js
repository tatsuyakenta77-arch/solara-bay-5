// Meridian Heat — pedestrians.
// One clear job: people who walk the sidewalks, wander at junctions and
// run away from speeding cars and gunfire.
import * as THREE from 'three';
import { WORLD, COLORS } from './config.js';
import { collideCircle } from './vehicles.js';

const SHIRTS = [0xd94f30, 0x3f7fbf, 0xe0a030, 0x7fbf5a, 0x9a6fbf, 0xbfbfbf, 0x30b0a0];

function makePedMesh(shirt) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, 1.05, 8),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 }),
  );
  body.position.y = 0.85;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.8 }),
  );
  head.position.y = 1.62;
  g.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.5, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 1 }),
  );
  legs.position.y = 0.25;
  g.add(legs);
  return g;
}

export class Pedestrians {
  constructor(scene, colliders, count = 14) {
    this.scene = scene;
    this.colliders = colliders;
    this.peds = [];
    for (let i = 0; i < count; i++) this.spawnRandom();
  }

  spawnRandom() {
    const road = WORLD.roads[Math.floor(Math.random() * WORLD.roads.length)];
    const along = WORLD.roads[Math.floor(Math.random() * WORLD.roads.length)]
      + (Math.random() * 30 - 15);
    const onXRoad = Math.random() < 0.5;
    const x = onXRoad ? along : road + 10;
    const z = onXRoad ? road + 10 : along;
    this.spawn(x, z);
  }

  spawn(x, z) {
    const mesh = makePedMesh(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const ped = {
      mesh, x, z,
      heading: Math.random() * Math.PI * 2,
      speed: 1.2 + Math.random() * 0.9,
      fleeT: 0, turnT: 2 + Math.random() * 4,
    };
    this.peds.push(ped);
    return ped;
  }

  scare(x, z, radius) {
    for (const p of this.peds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) p.fleeT = 2.5 + Math.random();
    }
  }

  update(dt, playerX, playerZ, playerSpeed, playerInCar) {
    for (const p of this.peds) {
      p.turnT -= dt;
      if (p.fleeT > 0) p.fleeT -= dt;
      let speed = p.speed;
      let targetHeading = p.heading;
      const pd = Math.hypot(p.x - playerX, p.z - playerZ);
      const danger = (playerInCar && playerSpeed > 8 && pd < 14) || p.fleeT > 0;
      if (danger) {
        speed = 4.2;
        targetHeading = Math.atan2(p.x - playerX, p.z - playerZ);
      } else if (p.turnT <= 0) {
        p.turnT = 2 + Math.random() * 4;
        // Keep to the sidewalks: pick a heading along a road axis.
        targetHeading = (Math.floor(Math.random() * 4) * Math.PI) / 2 + (Math.random() - 0.5) * 0.4;
      }
      let dh = targetHeading - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      const nx = p.x + Math.sin(p.heading) * speed * dt;
      const nz = p.z + Math.cos(p.heading) * speed * dt;
      const fixed = collideCircle(nx, nz, 0.5, this.colliders);
      p.x = Math.max(-210, Math.min(210, fixed.x));
      p.z = Math.max(-210, Math.min(196, fixed.z));
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // Simple walk bob.
      p.mesh.position.y = Math.abs(Math.sin(performance.now() / 140 + p.x)) * 0.06;
    }
  }

  // Nearest pedestrian to a point (for hit detection).
  nearest(x, z, maxD) {
    let best = null, bestD = maxD;
    for (const p of this.peds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best ? { ped: best, dist: bestD } : null;
  }
}
