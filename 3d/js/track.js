// ─────────────────────────────────────────────────────────────
// track.js · 赛道曲线、路面、标线、护栏、路肩、起点线、路边景物
// 曲线形状与原 3D 版完全一致（12 个控制点 / CatmullRom 闭合），玩法不漂移。
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { TRACK } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

// ── 程序化贴图：沥青颗粒 / 起点格子旗（Canvas 生成，无外部图片）──
function asphaltTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4a55';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const v = 40 + Math.random() * 70;
    g.fillStyle = `rgba(${v},${v},${v + 6},${0.25 + Math.random() * 0.5})`;
    const r = Math.random() * 2.2 + 0.4;
    g.fillRect(Math.random() * size, Math.random() * size, r, r);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// 棋盘格：按「列 × 行」直接生成，格子尺寸可控。
// 老版本用 8×8 贴图再 repeat(10,2)，起点线在远处被压成一条纯白横杠，
// 玩家根本认不出那是起跑线 —— 现在改成一次性铺满，格子大而清楚。
function checkerTexture(cols = 16, rows = 4, cell = 32) {
  const c = document.createElement('canvas');
  c.width = cols * cell;
  c.height = rows * cell;
  const g = c.getContext('2d');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = (x + y) % 2 ? '#14161c' : '#f6f9ff';
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;    // 不标 sRGB 的话白格会发灰、黑格会发白，远看就是一条白杠
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  // 关掉 mipmap：起跑线只有两行格子，远处一开 mip 就被平均成一条灰白杠
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

export function buildTrack(scene) {
  const SEG = TRACK.segments;
  const ROAD_W = TRACK.roadWidth;
  const group = new THREE.Group();
  scene.add(group);

  // ── 闭合曲线（形状沿用原版）──
  const pts = [];
  const R = TRACK.baseRadius, n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = R + Math.sin(i * 1.7) * 55 + Math.cos(i * 2.3) * 38;
    const y = Math.sin(i * 0.9) * 14 + Math.cos(i * 1.4) * 9;
    pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const trackLen = curve.getLength();

  const frames = [];
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) % 1;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(UP, tan).normalize();
    frames.push({ p, tan, side, t });
  }

  // ── 路面 ──
  const roadPos = [], roadUv = [], roadIdx = [];
  for (let i = 0; i <= SEG; i++) {
    const { p, side, t } = frames[i];
    const L = p.clone().addScaledVector(side, -ROAD_W / 2);
    const Rr = p.clone().addScaledVector(side, ROAD_W / 2);
    roadPos.push(L.x, L.y, L.z, Rr.x, Rr.y, Rr.z);
    roadUv.push(0, t * 60, 1, t * 60);
    if (i > 0) {
      const a = (i - 1) * 2, bb = a + 1, c = i * 2, d = c + 1;
      roadIdx.push(a, bb, c, bb, d, c);
    }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUv, 2));
  roadGeo.setIndex(roadIdx);
  roadGeo.computeVertexNormals();
  const asphalt = asphaltTexture();
  asphalt.repeat.set(3, 1);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, color: 0x62687a, roughness: 0.92, metalness: 0.03, side: THREE.DoubleSide });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ── 中央白虚线（独立小 quad，索引不跨段）──
  const dashPos = [], dashIdx = [];
  let dvi = 0;
  for (let i = 1; i <= SEG; i++) {
    if (i % TRACK.dashEvery >= TRACK.dashLen) continue;
    const a = frames[i - 1], b = frames[i];
    const y = 0.035;
    dashPos.push(
      a.p.x - a.side.x * 0.07, a.p.y + y, a.p.z - a.side.z * 0.07,
      a.p.x + a.side.x * 0.07, a.p.y + y, a.p.z + a.side.z * 0.07,
      b.p.x - b.side.x * 0.07, b.p.y + y, b.p.z - b.side.z * 0.07,
      b.p.x + b.side.x * 0.07, b.p.y + y, b.p.z + b.side.z * 0.07
    );
    dashIdx.push(dvi, dvi + 1, dvi + 2, dvi + 1, dvi + 3, dvi + 2);
    dvi += 4;
  }
  const dashGeo = new THREE.BufferGeometry();
  dashGeo.setAttribute('position', new THREE.Float32BufferAttribute(dashPos, 3));
  dashGeo.setIndex(dashIdx);
  dashGeo.computeVertexNormals();
  group.add(new THREE.Mesh(dashGeo, new THREE.MeshStandardMaterial({
    color: 0xf2f5fa, roughness: 0.6, metalness: 0, emissive: 0x1a1e26, emissiveIntensity: 0.35, side: THREE.DoubleSide,
  })));

  // ── 路肩红白块 + 黄边线 ──
  const curbPos = [], curbCol = [], curbIdx = [];
  const edgePos = [], edgeIdx = [];
  let ci = 0, ei = 0;
  const cRed = new THREE.Color(0xd23c3c), cWhite = new THREE.Color(0xe8edf5);
  for (let i = 1; i <= SEG; i++) {
    const a = frames[i - 1], b = frames[i];
    const col = Math.floor(i / 4) % 2 ? cRed : cWhite;
    const y = 0.06;
    for (const s of [-1, 1]) {
      const o1 = s * (ROAD_W / 2 + 0.02), o2 = s * (ROAD_W / 2 + 0.85);
      curbPos.push(
        a.p.x + a.side.x * o1, a.p.y + y, a.p.z + a.side.z * o1,
        a.p.x + a.side.x * o2, a.p.y + y * 2.2, a.p.z + a.side.z * o2,
        b.p.x + b.side.x * o1, b.p.y + y, b.p.z + b.side.z * o1,
        b.p.x + b.side.x * o2, b.p.y + y * 2.2, b.p.z + b.side.z * o2
      );
      for (let k = 0; k < 4; k++) curbCol.push(col.r, col.g, col.b);
      curbIdx.push(ci, ci + 1, ci + 2, ci + 1, ci + 3, ci + 2);
      ci += 4;
      // 黄边线（贴在路面内侧）
      const oe = s * (ROAD_W / 2 - 0.55);
      edgePos.push(
        a.p.x + a.side.x * (oe - 0.1 * s), a.p.y + 0.04, a.p.z + a.side.z * (oe - 0.1 * s),
        a.p.x + a.side.x * (oe + 0.1 * s), a.p.y + 0.04, a.p.z + a.side.z * (oe + 0.1 * s),
        b.p.x + b.side.x * (oe - 0.1 * s), b.p.y + 0.04, b.p.z + b.side.z * (oe - 0.1 * s),
        b.p.x + b.side.x * (oe + 0.1 * s), b.p.y + 0.04, b.p.z + b.side.z * (oe + 0.1 * s)
      );
      edgeIdx.push(ei, ei + 1, ei + 2, ei + 1, ei + 3, ei + 2);
      ei += 4;
    }
  }
  const curbGeo = new THREE.BufferGeometry();
  curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPos, 3));
  curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(curbCol, 3));
  curbGeo.setIndex(curbIdx);
  curbGeo.computeVertexNormals();
  group.add(new THREE.Mesh(curbGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide })));

  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
  edgeGeo.setIndex(edgeIdx);
  edgeGeo.computeVertexNormals();
  group.add(new THREE.Mesh(edgeGeo, new THREE.MeshStandardMaterial({ color: 0xd9b13f, roughness: 0.65, side: THREE.DoubleSide })));

  // ── 草地边坡：贴着赛道往下铺，避免两侧直接看到很低的地面平面（生硬绿块）──
  // 内沿压在路面下 0.15，不会盖住沥青；外沿向外 46 米、降 7 米
  const slopePos = [], slopeCol = [], slopeIdx = [];
  let si = 0;
  const gA = new THREE.Color(0x2f5c3a), gB = new THREE.Color(0x264b30);
  for (let i = 1; i <= SEG; i++) {
    const a = frames[i - 1], b = frames[i];
    const col = Math.floor(i / 5) % 2 ? gA : gB;
    for (const sgn of [-1, 1]) {
      const o1 = sgn * (ROAD_W / 2 + 0.85), o2 = sgn * (ROAD_W / 2 + 46);
      slopePos.push(
        a.p.x + a.side.x * o1, a.p.y - 0.15, a.p.z + a.side.z * o1,
        a.p.x + a.side.x * o2, a.p.y - 7.0, a.p.z + a.side.z * o2,
        b.p.x + b.side.x * o1, b.p.y - 0.15, b.p.z + b.side.z * o1,
        b.p.x + b.side.x * o2, b.p.y - 7.0, b.p.z + b.side.z * o2
      );
      for (let k = 0; k < 4; k++) slopeCol.push(col.r, col.g, col.b);
      slopeIdx.push(si, si + 1, si + 2, si + 1, si + 3, si + 2);
      si += 4;
    }
  }
  const slopeGeo = new THREE.BufferGeometry();
  slopeGeo.setAttribute('position', new THREE.Float32BufferAttribute(slopePos, 3));
  slopeGeo.setAttribute('color', new THREE.Float32BufferAttribute(slopeCol, 3));
  slopeGeo.setIndex(slopeIdx);
  slopeGeo.computeVertexNormals();
  const slopeMesh = new THREE.Mesh(slopeGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  }));
  slopeMesh.receiveShadow = true;
  group.add(slopeMesh);

  // ── 护栏（双面金属带）──
  const railPos = [], railIdx = [];
  let ri = 0;
  for (let i = 0; i <= SEG; i++) {
    const { p, side } = frames[i];
    for (const s of [-1, 1]) {
      const b = p.clone().addScaledVector(side, s * (ROAD_W / 2 + 1.1));
      railPos.push(b.x, b.y + 0.45, b.z, b.x, b.y + 0.45 + TRACK.railHeight, b.z);
    }
    if (i > 0) {
      for (let k = 0; k < 2; k++) {
        const r0 = ri + k * 2, r1 = ri - 4 + k * 2;
        railIdx.push(r1, r1 + 1, r0, r1 + 1, r0 + 1, r0);
      }
    }
    ri += 4;
  }
  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
  railGeo.setIndex(railIdx);
  railGeo.computeVertexNormals();
  group.add(new THREE.Mesh(railGeo, new THREE.MeshStandardMaterial({
    color: 0xc3ccdb, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide,
  })));

  // ── 起点 / 终点 ──
  // 之前：线画在 frames[3]（车前 9 米），贴图 repeat(10,2) 让远处糊成白条，
  // 玩家既看不出是起跑线，GO 之后又立刻被甩到车后 —— 观感就成了「车在线前面」。
  // 现在：线放回车前 6 米（frames[2]）、格子放大到一眼可辨，并且加一座起跑门架，
  // 起步和冲刺时都清清楚楚。
  function addCheckerLine(frameIdx, len = 6, cols = 9, rows = 3) {
    const f = frames[((frameIdx % SEG) + SEG) % SEG];
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_W - 0.4, len),
      // 用 MeshBasic + toneMapped:false：起跑线要像贴纸一样恒亮，
      // 走 Standard 会被黄昏强光 + ACES 压成一片灰白，格子就看不见了
      new THREE.MeshBasicMaterial({ map: checkerTexture(cols, rows), toneMapped: false })
    );
    plane.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(plane);
    holder.position.set(f.p.x, f.p.y + 0.05, f.p.z);
    holder.rotation.y = Math.atan2(f.tan.x, f.tan.z);
    holder.receiveShadow = true;
    group.add(holder);
    return holder;
  }

  // 起跑门架：两根立柱 + 横梁 + 一条棋盘横幅（纯视觉，不参与碰撞）
  function addGate(frameIdx, banner) {
    const f = frames[((frameIdx % SEG) + SEG) % SEG];
    const holder = new THREE.Group();
    holder.position.set(f.p.x, f.p.y, f.p.z);
    holder.rotation.y = Math.atan2(f.tan.x, f.tan.z);

    const postH = 7.2, off = ROAD_W / 2 + 1.5;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b8, roughness: 0.4, metalness: 0.75 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, postH, 8), postMat);
      post.position.set(s * off, postH / 2, 0);
      holder.add(post);
      // 柱顶红点，远处也能认出来
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xe8474f, emissive: 0xe8474f, emissiveIntensity: 0.9, roughness: 0.4 }));
      cap.position.set(s * off, postH + 0.15, 0);
      holder.add(cap);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(off * 2 + 0.7, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x7c8798, roughness: 0.45, metalness: 0.7 })
    );
    beam.position.set(0, postH, 0);
    holder.add(beam);

    // 横幅：面向来车，双面可见
    const banner3 = new THREE.Mesh(
      new THREE.PlaneGeometry(off * 2 - 1.2, 1.7),
      new THREE.MeshStandardMaterial({
        map: checkerTexture(banner === 'finish' ? 18 : 12, 2), side: THREE.DoubleSide,
        roughness: 0.5, metalness: 0.05,
        emissive: banner === 'finish' ? 0x3a2a2a : 0x22303f, emissiveIntensity: 0.5,
      })
    );
    banner3.position.set(0, postH - 1.35, 0);
    holder.add(banner3);

    holder.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    group.add(holder);
    return holder;
  }

  // 起终点：环形赛道只有「一条线 + 一座门架」，就画在 t=0（计圈点）上。
  // 之前起点线在 frames[3]、终点线在 frames[-3]，两条线夹着车只隔 18 米，
  // 俯视一眼就能看出是两套重复的标线；玩家起步时也分不清哪条是起跑线。
  addCheckerLine(0, 6, 6, 2);
  addGate(4, 'start');           // 门架在线前 12 米：再近就糊满上半屏


  // ── 路边景物：树与路灯（InstancedMesh，控制 draw call）──
  const treeCount = TRACK.trees;
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.44, 2.4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2b1e, roughness: 1 });
  const leafGeo = new THREE.ConeGeometry(2.2, 7, 7);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1a6b46, roughness: 0.9, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeCount);
  trunks.castShadow = false; leaves.castShadow = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < treeCount; i++) {
    const t = (i / treeCount) % 1;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(UP, tan).normalize();
    const dist = ROAD_W / 2 + 5 + Math.random() * 20;
    const pos = p.clone().addScaledVector(side, (i % 2 ? 1 : -1) * dist);
    const s = 0.7 + Math.random() * 0.8;
    dummy.position.set(pos.x, pos.y + 1.2 * s, pos.z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = pos.y + 4.6 * s;
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  group.add(trunks, leaves);

  const poleCount = TRACK.poles;
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 7, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6, metalness: 0.4 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleCount);
  for (let j = 0; j < poleCount; j++) {
    const t = (j / poleCount) % 1;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(UP, tan).normalize();
    const pos = p.clone().addScaledVector(side, (j % 2 ? 1 : -1) * (ROAD_W / 2 + 4.8));   // 推远：原来贴路太近，正好戳在视野中央
    dummy.position.set(pos.x, pos.y + 3.5, pos.z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(j, dummy.matrix);
  }
  poles.instanceMatrix.needsUpdate = true;
  group.add(poles);

  // ── 位置与几何查询 ──
  function posAt(t, lateral) {
    const tt = ((t % 1) + 1) % 1;
    const p = curve.getPointAt(tt);
    const tan = curve.getTangentAt(tt).normalize();
    const side = new THREE.Vector3().crossVectors(UP, tan).normalize();
    // side 增大时屏幕向左，取反后 lateral 为正 = 向右
    return { pos: p.clone().addScaledVector(side, -lateral * (ROAD_W / 2 - 1.2)), tan, side };
  }

  function curvatureAt(t) {
    const eps = 0.004;
    const t1 = (((t - eps) % 1) + 1) % 1, t2 = (((t + eps) % 1) + 1) % 1;
    const a = curve.getTangentAt(t1).normalize(), b = curve.getTangentAt(t2).normalize();
    return b.x * a.z - b.z * a.x;
  }

  return { curve, trackLen, group, posAt, curvatureAt, roadWidth: ROAD_W, segments: SEG, frames };
}
