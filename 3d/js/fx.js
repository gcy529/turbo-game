// ─────────────────────────────────────────────────────────────
// fx.js · 粒子系统与技能道具（全部程序化生成）
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { FX } from './config.js';

export function createParticles(scene) {
  const MAX = FX.maxParticles;
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.34, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  let list = [];
  function spawn(x, y, z, vx, vy, vz, r, g, b, size, life) {
    if (list.length >= MAX) list.shift();
    list.push({ x, y, z, vx, vy, vz, r, g, b, size, life, maxLife: life });
  }
  function burst(p, color, count, spread) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = spread * (0.4 + Math.random());
      spawn(p.x, p.y, p.z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, c.r, c.g, c.b, 0.4, 0.5 + Math.random() * 0.5);
    }
  }
  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= 5 * dt;
      p.vx *= 0.98; p.vz *= 0.98;
      p.life -= dt;
      if (p.life <= 0) list.splice(i, 1);
    }
    for (let i = 0; i < MAX; i++) {
      const p = list[i], o = i * 3;
      if (p) {
        const a = Math.min(1, p.life / p.maxLife);
        pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
        col[o] = p.r * a; col[o + 1] = p.g * a; col[o + 2] = p.b * a;
      } else {
        pos[o] = 0; pos[o + 1] = -1000; pos[o + 2] = 0;
        col[o] = col[o + 1] = col[o + 2] = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
  function reset() { list = []; update(0); }

  return { spawn, burst, update, reset, points };
}

export function createSkillItems(scene, track) {
  const items = [];
  const geo = new THREE.OctahedronGeometry(0.5, 0);
  const ringGeo = new THREE.TorusGeometry(0.75, 0.03, 6, 24);

  for (let i = 0; i < FX.skillItems; i++) {
    const t = 0.05 + Math.random() * 0.9;
    const lateral = (Math.random() - 0.5) * 1.2;
    const type = FX.skillTypes[Math.floor(Math.random() * FX.skillTypes.length)];
    const color = FX.skillColors[type];
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    const api = track.posAt(t, lateral);
    mesh.position.copy(api.pos);
    mesh.position.y = api.pos.y + 1.25;
    mesh.castShadow = true;
    const halo = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    halo.rotation.x = Math.PI / 2;
    mesh.add(halo);
    scene.add(mesh);
    items.push({ mesh, t, lateral, type, collected: false, baseY: mesh.position.y, seed: Math.random() * 6 });
  }

  function update(dt, clock, playerPos, magnetRange) {
    for (const it of items) {
      if (it.collected) continue;
      it.mesh.rotation.y += dt * 1.6;
      it.mesh.rotation.x += dt * 0.7;
      it.mesh.position.y = it.baseY + Math.sin(clock * 2 + it.seed) * 0.18;
      if (magnetRange > 0) {
        const dx = playerPos.x - it.mesh.position.x, dz = playerPos.z - it.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d < magnetRange && d > 0.001) {
          it.mesh.position.x += (dx / d) * 5 * dt;
          it.mesh.position.z += (dz / d) * 5 * dt;
        }
      }
    }
  }

  /** 返回本帧吃到的道具（类型）*/
  function collect(playerPos) {
    const got = [];
    for (const it of items) {
      if (it.collected) continue;
      const dx = playerPos.x - it.mesh.position.x, dz = playerPos.z - it.mesh.position.z;
      if (Math.hypot(dx, dz) < 2.5) {
        it.collected = true;
        it.mesh.visible = false;
        got.push({ type: it.type, position: it.mesh.position.clone() });
      }
    }
    return got;
  }

  function reset() {
    for (const it of items) { it.collected = false; it.mesh.visible = true; }
  }
  return { items, update, collect, reset };
}

export function createShield(scene) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  mesh.visible = false;
  scene.add(mesh);
  return {
    mesh,
    update(dt, clock, active, pos) {
      mesh.visible = active;
      if (!active) return;
      mesh.position.copy(pos);
      mesh.position.y += 1.3;
      mesh.material.opacity = 0.14 + Math.sin(clock * 6) * 0.05;
      mesh.rotation.y += dt * 0.6;
    },
  };
}
