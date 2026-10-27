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

function checkerTexture() {
  const size = 64, cells = 8;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const step = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      g.fillStyle = (x + y) % 2 ? '#12141a' : '#f2f5fa';
      g.fillRect(x * step, y * step, step, step);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
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
      a.p.x - a.side.x * 0.13, a.p.y + y, a.p.z - a.side.z * 0.13,
      a.p.x + a.side.x * 0.13, a.p.y + y, a.p.z + a.side.z * 0.13,
      b.p.x - b.side.x * 0.13, b.p.y + y, b.p.z - b.side.z * 0.13,
      b.p.x + b.side.x * 0.13, b.p.y + y, b.p.z + b.side.z * 0.13
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

  // ── 起点/终点格子线 ──
  const startP = frames[0].p, startTan = frames[0].tan;
  const startPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_W, 2.6),
    new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.7 })
  );
  startPlane.material.map.repeat.set(6, 1);
  startPlane.rotation.x = -Math.PI / 2;
  const startHolder = new THREE.Group();
  startHolder.add(startPlane);
  startHolder.position.set(startP.x, startP.y + 0.05, startP.z);
  startHolder.rotation.y = Math.atan2(startTan.x, startTan.z);
  group.add(startHolder);

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
    const pos = p.clone().addScaledVector(side, (j % 2 ? 1 : -1) * (ROAD_W / 2 + 2.6));
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
