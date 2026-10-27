// ─────────────────────────────────────────────────────────────
// fx.js · 粒子系统与赛道金币（全部程序化生成）
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
  // 圆形软边贴图：默认的方形点在高分辨率下就是一堆白方块
  const sprite = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.42, 'rgba(255,255,255,.62)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const mat = new THREE.PointsMaterial({
    size: 0.46, map: sprite, alphaTest: 0.02, vertexColors: true, transparent: true, opacity: 0.95,
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

export function createCoins(scene, track) {
  // 赛道上撒金币：每圈一批，跑完一圈重新刷，两圈都能捡
  // 视觉：金色圆盘（薄圆柱）+ 加色光晕，自转 + 上下浮动
  const items = [];
  const geo = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 20);
  geo.rotateX(Math.PI / 2);                 // 立起来当硬币
  const haloGeo = new THREE.TorusGeometry(0.86, 0.045, 6, 24);
  const gold = FX.coinColors[0];

  function buildOne(i, n) {
    const t = (i + 0.5) / n;
    const lateral = (Math.random() - 0.5) * 1.15;
    const mat = new THREE.MeshStandardMaterial({
      color: gold, emissive: 0xffb300, emissiveIntensity: 0.85,
      metalness: 0.9, roughness: 0.22,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const api = track.posAt(t, lateral);
    mesh.position.copy(api.pos);
    mesh.position.y = api.pos.y + 1.05;
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
      color: 0xffd54f, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mesh.add(halo);
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, halo, t, lateral, collected: false, baseY: mesh.position.y, seed: Math.random() * 6 };
  }

  function spawnAll() {
    const n = FX.coinCount;
    for (let i = 0; i < n; i++) items.push(buildOne(i, n));
  }
  spawnAll();

  function update(dt, clock) {
    for (const it of items) {
      if (it.collected) continue;
      it.mesh.rotation.y += dt * 2.2;
      it.mesh.position.y = it.baseY + Math.sin(clock * 2.4 + it.seed) * 0.16;
      it.halo.scale.setScalar(1 + Math.sin(clock * 3 + it.seed) * 0.08);
    }
  }

  /** 返回本帧吃到的金币（含世界坐标，用于爆特效）*/
  function collect(playerPos) {
    const got = [];
    for (const it of items) {
      if (it.collected) continue;
      const dx = playerPos.x - it.mesh.position.x, dz = playerPos.z - it.mesh.position.z;
      if (Math.hypot(dx, dz) < FX.coinRadius) {
        it.collected = true;
        it.mesh.visible = false;
        got.push({ position: it.mesh.position.clone() });
      }
    }
    return got;
  }

  /** 一圈跑完：金币重新铺出来 */
  function reshuffle() {
    for (const it of items) { it.collected = false; it.mesh.visible = true; }
  }
  function reset() { reshuffle(); }

  return { items, update, collect, reset, reshuffle };
}
