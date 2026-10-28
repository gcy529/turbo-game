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
  // 赛道金币（天天飞车那套节奏）：
  //   出现（弹一下）→ 亮着 9~14 秒 → 没吃就缩小消失 → 冷却 2.5~4.5 秒 → 换个地方再出现
  // 原来是 24 枚钉死在原地、跑完一圈才刷新，赛道上经常出现「一段有、一段空」的死区。
  const items = [];
  const geo = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 20);
  geo.rotateX(Math.PI / 2);                 // 立起来当硬币
  const haloGeo = new THREE.TorusGeometry(0.86, 0.045, 6, 24);
  const gold = FX.coinColors[0];

  const LIFE_MIN = 10, LIFE_MAX = 22;
  const COOL_MIN = 1.5, COOL_MAX = 3;
  const FADE_IN = 0.28, FADE_OUT = 0.22;

  function wrapDelta(a, b) {
    let d = a - b;
    if (d < -0.5) d += 1;
    if (d > 0.5) d -= 1;
    return d;
  }

  /** 在赛道上挑一个空位：重生时优先放到玩家前方（天天飞车那种「前面一直有」的节奏） */
  function place(it, playerT) {
    const pt = playerT === undefined ? null : ((playerT % 1) + 1) % 1;
    let t = Math.random(), lateral = 0;
    for (let k = 0; k < 14; k++) {
      // 已经开跑：8%~78% 圈的前方随机；开局 / 换圈：整圈均匀铺
      const raw = pt === null ? Math.random() : pt + 0.08 + Math.random() * 0.70;
      t = ((raw % 1) + 1) % 1;
      lateral = (Math.random() - 0.5) * 1.15;
      let ok = pt === null || Math.abs(wrapDelta(t, pt)) > 0.035;
      if (!ok) continue;
      for (const o of items) {
        if (o === it || o.state === 'off') continue;
        if (Math.abs(wrapDelta(t, o.t)) < 0.014) { ok = false; break; }
      }
      if (ok) break;
    }
    it.t = t;
    it.lateral = lateral;
    const api = track.posAt(t, lateral);
    it.mesh.position.copy(api.pos);
    it.mesh.position.y = api.pos.y + 1.05;
    it.baseY = it.mesh.position.y;
  }

  function buildOne(i, n) {
    const mat = new THREE.MeshStandardMaterial({
      color: gold, emissive: 0xffb300, emissiveIntensity: 0.85,
      metalness: 0.9, roughness: 0.22,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
      color: 0xffd54f, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mesh.add(halo);
    mesh.castShadow = true;
    scene.add(mesh);
    const it = {
      mesh, halo, t: (i + 0.5) / n, lateral: 0, state: 'on', life: LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN),
      cool: 0, anim: 0, baseY: 0, seed: Math.random() * 6,
    };
    place(it);
    return it;
  }

  function spawnAll() {
    const n = FX.coinCount;
    for (let i = 0; i < n; i++) items.push(buildOne(i, n));
  }
  spawnAll();

  function update(dt, clock, playerT) {
    for (const it of items) {
      if (it.state === 'off') {
        it.cool -= dt;
        if (it.cool <= 0) {
          place(it, playerT);
          it.state = 'in';
          it.anim = 0;
          it.mesh.visible = true;
          it.mesh.scale.setScalar(0.01);
        }
        continue;
      }
      if (it.state === 'in') {
        // 出现：从 0 弹到 1，带一点过冲
        it.anim += dt;
        const k = Math.min(1, it.anim / FADE_IN);
        const s = k < 1 ? k * (1 + (1 - k) * 0.45) : 1;
        it.mesh.scale.setScalar(Math.max(0.01, s));
        if (k >= 1) {
          it.mesh.scale.setScalar(1);
          it.state = 'on';
          it.life = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN);
        }
        continue;
      }
      if (it.state === 'on') {
        it.life -= dt;
        if (it.life <= 0) { it.state = 'out'; it.anim = 0; continue; }
      } else if (it.state === 'out') {
        // 消失：缩到 0 再藏起来
        it.anim += dt;
        const k = Math.max(0, 1 - it.anim / FADE_OUT);
        it.mesh.scale.setScalar(k);
        if (k <= 0.01) {
          it.state = 'off';
          it.mesh.visible = false;
          it.cool = COOL_MIN + Math.random() * (COOL_MAX - COOL_MIN);
          continue;
        }
      }
      it.mesh.rotation.y += dt * 2.2;
      it.mesh.position.y = it.baseY + Math.sin(clock * 2.4 + it.seed) * 0.16;
      it.halo.scale.setScalar(1 + Math.sin(clock * 3 + it.seed) * 0.08);
    }
  }

  /** 返回本帧吃到的金币（含世界坐标，用于爆特效）*/
  function collect(playerPos) {
    const got = [];
    for (const it of items) {
      if (it.state !== 'on' && it.state !== 'in') continue;
      const dx = playerPos.x - it.mesh.position.x, dz = playerPos.z - it.mesh.position.z;
      if (Math.hypot(dx, dz) < FX.coinRadius) {
        it.state = 'off';
        it.mesh.visible = false;
        it.cool = COOL_MIN + Math.random() * (COOL_MAX - COOL_MIN);
        got.push({ position: it.mesh.position.clone() });
      }
    }
    return got;
  }

  /** 一圈跑完：全部重新铺出来 */
  function reshuffle() {
    items.forEach((it, i) => {
      place(it);
      it.state = 'in';
      it.anim = 0;
      it.mesh.visible = true;
      it.mesh.scale.setScalar(0.01);
      it.life = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN);
    });
  }
  function reset() { reshuffle(); }

  /** 换赛道时整组扔掉：金币闭包持有旧 track，不释放会一直引用旧曲线 */
  function dispose() {
    for (const it of items) {
      for (const o of [it.mesh, it.halo]) {
        if (!o) continue;
        if (o.parent) o.parent.remove(o);
        if (o.geometry) o.geometry.dispose();
      }
    }
    items.length = 0;
  }

  return { items, update, collect, reset, reshuffle, dispose };
}

