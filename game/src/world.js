// Meridian Heat — city construction.
// One clear job: turn the config grid into a visible, collidable 3D city:
// roads, sidewalks, lit-window towers, marina, pier, boats and the north
// bridge. Returns colliders and landmark handles for the other systems.
import * as THREE from 'three';
import { WORLD, COLORS } from './config.js';

function windowTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#20242c';
  g.fillRect(0, 0, 64, 128);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let y = 6; y < 122; y += 10) {
    for (let x = 5; x < 58; x += 9) {
      const lit = rnd() < 0.45;
      g.fillStyle = lit ? '#ffd98a' : '#39424f';
      g.fillRect(x, y, 6, 7);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene) {
  const colliders = [];   // {minX, maxX, minZ, maxZ} AABBs the player/cars hit
  const roadSet = new Set(WORLD.roads);
  const isRoadX = (x) => WORLD.roads.some((r) => Math.abs(x - r) <= WORLD.roadHalf + 2);
  const isRoadZ = (z) => WORLD.roads.some((r) => Math.abs(z - r) <= WORLD.roadHalf + 2);

  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 260, 620);

  const sun = new THREE.DirectionalLight(COLORS.sun, 2.4);
  sun.position.set(120, 220, 60);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd0e0, 0.85));
  const hemi = new THREE.HemisphereLight(0xbfd9ee, 0x3a3f45, 0.7);
  scene.add(hemi);

  // Ground slab.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 620),
    new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  scene.add(ground);

  // Road ribbons + centre dashes.
  const roadMat = new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 0.95 });
  const dashMat = new THREE.MeshStandardMaterial({ color: COLORS.roadLine, roughness: 0.8 });
  for (const r of WORLD.roads) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.bound * 2 + 80, WORLD.roadHalf * 2), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0, r); scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadHalf * 2, WORLD.bound * 2 + 80), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(r, 0, 0); scene.add(v);
    for (let d = -WORLD.bound; d <= WORLD.bound; d += 16) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), dashMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(d, 0.01, r); scene.add(d);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), dashMat);
      dash2.rotation.x = -Math.PI / 2; dash2.position.set(r, 0.01, d); scene.add(dash2);
    }
  }

  // Buildings: one or two towers per block, with lit windows.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const winTex = [windowTexture(11), windowTexture(47), windowTexture(83)];
  let seed = 1234567;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const blocks = [];
  for (let ix = 0; ix < WORLD.roads.length - 1; ix++) {
    for (let iz = 0; iz < WORLD.roads.length - 1; iz++) {
      const x0 = WORLD.roads[ix] + WORLD.roadHalf + 2;
      const x1 = WORLD.roads[ix + 1] - WORLD.roadHalf - 2;
      const z0 = WORLD.roads[iz] + WORLD.roadHalf + 2;
      const z1 = WORLD.roads[iz + 1] - WORLD.roadHalf - 2;
      // Keep the marina approach and the bridge approach clear.
      if (z1 > WORLD.marinaZ - 4) continue;
      if (z0 < WORLD.northChannelZ + 4) continue;
      blocks.push({ x0, x1, z0, z1 });
    }
  }
  for (const b of blocks) {
    const n = rnd() < 0.55 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const w = 12 + rnd() * 14;
      const d = 12 + rnd() * 14;
      const h = 14 + rnd() * 46;
      const cx = b.x0 + w / 2 + rnd() * Math.max(1, (b.x1 - b.x0) - w);
      const cz = b.z0 + d / 2 + rnd() * Math.max(1, (b.z1 - b.z0) - d);
      const color = COLORS.building[Math.floor(rnd() * COLORS.building.length)];
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.85, metalness: 0.08,
        emissive: 0xffffff, emissiveMap: winTex[Math.floor(rnd() * winTex.length)],
        emissiveIntensity: 0.55,
      });
      const tower = new THREE.Mesh(boxGeo, mat);
      tower.scale.set(w, h, d);
      tower.position.set(cx, h / 2, cz);
      scene.add(tower);
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      // Rooftop box for skyline variety.
      if (rnd() < 0.5) {
        const roof = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 1 }));
        roof.scale.set(w * 0.4, 3, d * 0.4);
        roof.position.set(cx, h + 1.5, cz);
        scene.add(roof);
      }
    }
  }

  // Marina: water, sand strip, pier and moored boats.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(620, WORLD.marinaEnd - WORLD.marinaZ),
    new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.25, metalness: 0.35 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.15, (WORLD.marinaZ + WORLD.marinaEnd) / 2);
  scene.add(water);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 10),
    new THREE.MeshStandardMaterial({ color: COLORS.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, WORLD.marinaZ - 5);
  scene.add(sand);

  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6b46, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 44), pierMat);
  pier.position.set(0, 0.6, WORLD.marinaZ + 20);
  scene.add(pier);
  colliders.push({ minX: -8, maxX: 8, minZ: WORLD.marinaZ - 2, maxZ: WORLD.marinaZ + 42 });

  const boatMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4 });
  const boatMat2 = new THREE.MeshStandardMaterial({ color: 0x2a6f97, roughness: 0.4 });
  const boats = [];
  for (let i = 0; i < 5; i++) {
    const hull = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 11), i % 2 ? boatMat : boatMat2);
    body.position.y = 0.6; hull.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0x222831 }));
    cabin.position.set(0, 1.9, -1); hull.add(cabin);
    const bx = -60 + i * 30;
    hull.position.set(bx, 0.1, WORLD.marinaZ + 14 + (i % 2) * 8);
    hull.rotation.y = (i % 2 ? 0.12 : -0.08);
    scene.add(hull);
    boats.push(hull);
  }

  // North channel + bridge deck.
  const channel = new THREE.Mesh(
    new THREE.PlaneGeometry(620, WORLD.northChannelZ - WORLD.northEnd),
    new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.25, metalness: 0.35 }),
  );
  channel.rotation.x = -Math.PI / 2;
  channel.position.set(0, 0.15, (WORLD.northChannelZ + WORLD.northEnd) / 2);
  scene.add(channel);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD.bridgeHalf * 2, 1, WORLD.northChannelZ - WORLD.northEnd + 16),
    new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.9 }),
  );
  deck.position.set(WORLD.bridgeX, 0.5, (WORLD.northChannelZ + WORLD.northEnd) / 2);
  scene.add(deck);
  // Bridge rails.
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd8c95a, roughness: 0.6 });
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, WORLD.northChannelZ - WORLD.northEnd + 16), railMat);
    rail.position.set(WORLD.bridgeX + sx * (WORLD.bridgeHalf - 0.4), 1.6, (WORLD.northChannelZ + WORLD.northEnd) / 2);
    scene.add(rail);
  }
  // Bridge towers.
  for (const z of [WORLD.northChannelZ - 6, WORLD.northEnd + 6]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.5, 26, 2.5), new THREE.MeshStandardMaterial({ color: 0x8a2f2f, roughness: 0.7 }));
    tower.position.set(WORLD.bridgeX - WORLD.bridgeHalf, 13, z);
    scene.add(tower);
    const tower2 = tower.clone();
    tower2.position.x = WORLD.bridgeX + WORLD.bridgeHalf;
    scene.add(tower2);
  }

  // Street props: lamps along main roads, palms near the marina.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffe9a8, emissiveIntensity: 1.4 });
  for (const r of [-96, 0, 96]) {
    for (let d = -180; d <= 180; d += 48) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), lampMat);
      pole.position.set(r + 9, 3.5, d);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampGlow);
      bulb.position.set(r + 9, 7.1, d);
      scene.add(bulb);
    }
  }
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x3d6b35, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const px = -180 + i * 40;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat);
    trunk.position.set(px, 3, WORLD.marinaZ - 12);
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 7), palmMat);
    crown.position.set(px, 7.4, WORLD.marinaZ - 12);
    scene.add(crown);
  }

  return { colliders, isRoadX, isRoadZ, boats, roadSet };
}
