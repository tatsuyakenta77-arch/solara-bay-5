// Meridian Heat — vehicles: player cars, traffic and police.
// One clear job: build car meshes, drive them with arcade physics, run
// road-bound traffic, and chase the player with police cars.
import * as THREE from 'three';
import { WORLD, COLORS, TUNING } from './config.js';

export function makeCarMesh(color, kind = 'sedan', police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, kind === 'suv' ? 4.6 : 4.2), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, kind === 'coupe' ? 1.9 : 2.3), glassMat);
  cabin.position.set(0, 1.1, kind === 'suv' ? 0.1 : -0.2);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.38, z);
    g.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xfff2ae, emissiveIntensity: 0.9 });
  for (const x of [-0.65, 0.65]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), lightMat);
    l.position.set(x, 0.62, 2.12);
    g.add(l);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
    bar.position.set(0, 1.5, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.6 }));
    red.position.set(-0.28, 1.6, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1.6 }));
    blue.position.set(0.28, 1.6, -0.2);
    g.add(blue);
    g.userData.lightBar = { red, blue };
  }
  g.userData.wheels = wheels;
  return g;
}

// Push a circle (x, z, r) out of every building AABB it overlaps.
export function collideCircle(x, z, r, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 1e-6) { x = c.maxX + r; continue; }
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      z = nz + (dz / d) * r;
    }
  }
  return { x, z };
}

export function inWater(x, z) {
  if (z > WORLD.marinaZ && Math.abs(x) > 9) return true;
  if (z < WORLD.northChannelZ && Math.abs(x - WORLD.bridgeX) > WORLD.bridgeHalf) return true;
  return false;
}

export class Car {
  constructor(mesh, x, z, heading, color) {
    this.mesh = mesh;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.color = color;
    this.health = 100;
    this.stopped = false;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
  }

  // Arcade drive: throttle -1..1, steer -1..1, brake 0..1.
  drive(dt, throttle, steer, brake, colliders) {
    if (this.stopped) { this.speed *= Math.max(0, 1 - 4 * dt); }
    else {
      const maxF = TUNING.carMaxSpeed;
      if (throttle > 0) this.speed += TUNING.carAccel * throttle * dt;
      else if (throttle < 0) this.speed += TUNING.carAccel * throttle * dt * 0.7;
      if (brake > 0) this.speed -= Math.sign(this.speed) * TUNING.carBrake * brake * dt;
      this.speed -= this.speed * 0.55 * dt; // drag + rolling resistance
      this.speed = Math.max(-TUNING.carReverseMax, Math.min(maxF, this.speed));
      if (Math.abs(this.speed) < 0.15 && throttle === 0) this.speed = 0;
      const grip = Math.min(1, Math.abs(this.speed) / 8);
      this.heading += steer * TUNING.carTurn * grip * Math.sign(this.speed || 1) * dt;
    }
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const fixed = collideCircle(nx, nz, 1.7, colliders);
    let hitWall = false;
    if (fixed.x !== nx || fixed.z !== nz) { hitWall = true; this.speed *= 0.55; }
    if (inWater(fixed.x, fixed.z)) { hitWall = true; this.speed *= 0.4; }
    else { this.x = fixed.x; this.z = fixed.z; }
    this.x = Math.max(-258, Math.min(258, this.x));
    this.z = Math.max(-258, Math.min(262, this.z));
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * dt * 2.4;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    return hitWall;
  }
}

// Traffic: cars that stay on the road grid, switching roads at junctions.
export class Traffic {
  constructor(scene, colliders, count = 10) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    for (let i = 0; i < count; i++) this.spawn();
  }

  spawn() {
    const color = COLORS.carBody[Math.floor(Math.random() * COLORS.carBody.length)];
    const mesh = makeCarMesh(color, 'sedan');
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const road = WORLD.roads[Math.floor(Math.random() * WORLD.roads.length)];
    const along = WORLD.roads[Math.floor(Math.random() * WORLD.roads.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.scene.add(mesh);
    const car = {
      mesh, axis, road, along, dir,
      speed: 9 + Math.random() * 5,
      x: axis === 'x' ? along : road,
      z: axis === 'x' ? road : along,
    };
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    this.cars.push(car);
    return car;
  }

  update(dt) {
    for (const c of this.cars) {
      c.along += c.dir * c.speed * dt;
      // At a junction, sometimes turn onto the crossing road.
      const nearJunction = WORLD.roads.some((r) => Math.abs(c.along - r) < 1.2);
      if (nearJunction && Math.random() < dt * 0.5) {
        const j = WORLD.roads.reduce((a, b) => Math.abs(b - c.along) < Math.abs(a - c.along) ? b : a);
        c.along = j;
        const oldAxis = c.axis;
        c.axis = oldAxis === 'x' ? 'z' : 'x';
        c.road = j;
        c.dir = Math.random() < 0.5 ? 1 : -1;
      }
      if (c.along > WORLD.bound + 6) { c.along = -WORLD.bound - 6; }
      if (c.along < -WORLD.bound - 6) { c.along = WORLD.bound + 6; }
      c.x = c.axis === 'x' ? c.along : c.road;
      c.z = c.axis === 'x' ? c.road : c.along;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      const spin = c.speed * dt * 2.4;
      for (const w of c.mesh.userData.wheels) w.rotation.x += spin;
    }
  }
}

// Police: spawn up to the wanted level, chase and ram the player.
export class Police {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.units = [];
    this.flashT = 0;
  }

  setCount(n, px, pz) {
    while (this.units.length < n) {
      const mesh = makeCarMesh(COLORS.police, 'sedan', true);
      const a = Math.random() * Math.PI * 2;
      const d = 55 + Math.random() * 25;
      const x = Math.max(-200, Math.min(200, px + Math.sin(a) * d));
      const z = Math.max(-200, Math.min(200, pz + Math.cos(a) * d));
      this.scene.add(mesh);
      this.units.push({ car: new Car(mesh, x, z, 0, COLORS.police), siren: 0 });
    }
    while (this.units.length > n) {
      const u = this.units.pop();
      this.scene.remove(u.car.mesh);
    }
  }

  update(dt, px, pz, playerSpeed) {
    this.flashT += dt;
    const phase = Math.floor(this.flashT * 6) % 2 === 0;
    for (const u of this.units) {
      const c = u.car;
      const dx = px - c.x, dz = pz - c.z;
      const dist = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(dx, dz);
      let dh = want - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dh * 1.6));
      const throttle = dist > 6 ? 1 : 0.4;
      c.drive(dt, throttle, steer, 0, this.colliders);
      if (c.mesh.userData.lightBar) {
        c.mesh.userData.lightBar.red.material.emissiveIntensity = phase ? 2.2 : 0.15;
        c.mesh.userData.lightBar.blue.material.emissiveIntensity = phase ? 0.15 : 2.2;
      }
    }
  }

  clear() {
    for (const u of this.units) this.scene.remove(u.car.mesh);
    this.units = [];
  }
}
