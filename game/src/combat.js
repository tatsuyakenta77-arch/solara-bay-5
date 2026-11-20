// Meridian Heat — combat, enemies and particles.
// One clear job: rival crew members who shoot back, the player's pistol
// and fists, health pickups, and the particle bursts for shots, hits and
// crashes.
import * as THREE from 'three';
import { TUNING, COLORS } from './config.js';

function makeEnemyMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.44, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x8c1f28, roughness: 0.85 }),
  );
  body.position.y = 0.88;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xc9977a, roughness: 0.8 }),
  );
  head.position.y = 1.66;
  g.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.6 }),
  );
  gun.position.set(0.3, 1.05, 0.5);
  g.add(gun);
  // Health bar: dark backing + green fill, billboarded in update().
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x330000 }));
  const fg = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.08, 0.03),
    new THREE.MeshBasicMaterial({ color: 0x33ff66 }));
  fg.position.z = 0.01;
  bar.add(bg); bar.add(fg);
  bar.position.y = 2.15;
  bar.userData.fill = fg;
  g.add(bar);
  g.userData.bar = bar;
  return g;
}

export class Particles {
  constructor(scene, max = 400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -100;
  }

  burst(x, y, z, color, count = 14, speed = 7, up = 3) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.4 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.life[i] = 0.5 + Math.random() * 0.5;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.vel[i * 3 + 1] -= 9 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.ray = new THREE.Raycaster();
    this.pickups = [];
    this.pickupMeshes = [];
  }

  spawnEnemies(list) {
    // list: [{x, z}] — rival crew members.
    for (const p of list) {
      const mesh = makeEnemyMesh();
      mesh.position.set(p.x, 0, p.z);
      this.scene.add(mesh);
      this.enemies.push({
        mesh, x: p.x, z: p.z, health: TUNING.enemyHealth,
        cool: 1 + Math.random(), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 2,
      });
    }
  }

  spawnPickups(list) {
    const geo = new THREE.BoxGeometry(0.9, 0.28, 0.9);
    const geo2 = new THREE.BoxGeometry(0.28, 0.9, 0.9);
    for (const p of list) {
      const g = new THREE.Group();
      const m1 = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COLORS.health, emissive: 0x1d7a3a, emissiveIntensity: 0.9 }));
      const m2 = new THREE.Mesh(geo2, m1.material);
      g.add(m1); g.add(m2);
      g.position.set(p.x, 1.1, p.z);
      this.scene.add(g);
      this.pickups.push({ mesh: g, x: p.x, z: p.z, taken: false, spin: 0 });
    }
  }

  // Player fires the pistol along a world ray. Returns the enemy hit, if any.
  shoot(origin, dir, onHit) {
    this.ray.set(origin, dir);
    this.ray.far = 90;
    let best = null, bestD = 90;
    for (const e of this.enemies) {
      if (e.health <= 0) continue;
      // Sphere test against the enemy torso.
      const cx = e.x - origin.x, cy = 1.1 - origin.y, cz = e.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > bestD) continue;
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      const d = Math.hypot(px - e.x, py - 1.1, pz - e.z);
      if (d < 1.1) { best = e; bestD = t; }
    }
    if (best) {
      best.health -= TUNING.pistolDamage;
      if (onHit) onHit(best);
    }
    return best;
  }

  melee(x, z, heading, onHit) {
    let hitAny = null;
    for (const e of this.enemies) {
      if (e.health <= 0) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > TUNING.meleeRange) continue;
      const ang = Math.atan2(e.x - x, e.z - z);
      let dh = ang - heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      if (Math.abs(dh) > 1.1) continue;
      e.health -= TUNING.meleeDamage;
      hitAny = e;
      if (onHit) onHit(e);
    }
    return hitAny;
  }

  update(dt, px, pz, camera, onEnemyShot, onPlayerHit) {
    for (const e of this.enemies) {
      if (e.health <= 0) continue;
      const d = Math.hypot(e.x - px, e.z - pz);
      e.mesh.userData.bar.quaternion.copy(camera.quaternion);
      e.mesh.userData.bar.userData.fill.scale.x = Math.max(0.01, e.health / TUNING.enemyHealth);
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeT = 1.5 + Math.random(); e.strafe *= -1; }
      if (d < TUNING.enemyRange) {
        e.mesh.lookAt(px, 0, pz);
        // Strafe sideways while keeping distance.
        const ang = Math.atan2(px - e.x, pz - e.z) + Math.PI / 2;
        let mx = 0, mz = 0;
        if (d > 16) { mx = Math.sin(Math.atan2(px - e.x, pz - e.z)); mz = Math.cos(Math.atan2(px - e.x, pz - e.z)); }
        else if (d < 7) { mx = -Math.sin(Math.atan2(px - e.x, pz - e.z)); mz = -Math.cos(Math.atan2(px - e.x, pz - e.z)); }
        mx += Math.sin(ang) * e.strafe * 0.7;
        mz += Math.cos(ang) * e.strafe * 0.7;
        const len = Math.hypot(mx, mz) || 1;
        e.x += (mx / len) * 3.4 * dt;
        e.z += (mz / len) * 3.4 * dt;
        e.mesh.position.set(e.x, 0, e.z);
        e.cool -= dt;
        if (e.cool <= 0 && d < TUNING.enemyRange) {
          e.cool = 1.1 + Math.random() * 0.9;
          if (onEnemyShot) onEnemyShot(e);
          // Hit chance falls with distance.
          if (Math.random() < Math.max(0.12, 0.5 - d * 0.014) && onPlayerHit) {
            onPlayerHit(TUNING.enemyDamage);
          }
        }
      }
    }
    // Remove the dead.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].health <= 0) {
        const e = this.enemies[i];
        this.scene.remove(e.mesh);
        this.enemies.splice(i, 1);
      }
    }
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.spin += dt;
      p.mesh.rotation.y = p.spin;
      p.mesh.position.y = 1.1 + Math.sin(p.spin * 2) * 0.15;
    }
  }

  pickupNear(x, z, radius = 2.2) {
    for (const p of this.pickups) {
      if (p.taken) continue;
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        p.taken = true;
        p.mesh.visible = false;
        return p;
      }
    }
    return null;
  }

  aliveCount() { return this.enemies.length; }
  clear() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }
}
