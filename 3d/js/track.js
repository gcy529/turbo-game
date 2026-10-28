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

// 门架横幅：深色底 + 上下棋盘条 + 中间白字。
// 只用英文数字：Canvas 里的中文在缺字体的机器上会渲染成方块，而横幅是要跨设备看的。
function bannerTexture() {
  const W = 1024, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1a2536');
  grd.addColorStop(0.5, '#0b131f');
  grd.addColorStop(1, '#1a2536');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // 上下两条棋盘格：远处一眼能认出这是「起终点」
  const cell = 16;
  for (let row = 0; row < 2; row++) {
    const y = row === 0 ? 0 : H - cell;
    for (let x = 0; x * cell < W; x++) {
      g.fillStyle = ((x + row) % 2) ? '#0a0d12' : '#f4f8ff';
      g.fillRect(x * cell, y, cell, cell);
    }
  }

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 52px "Arial Black", Impact, "Arial", sans-serif';
  g.shadowColor = 'rgba(255,201,77,.85)';
  g.shadowBlur = 18;
  g.fillStyle = '#fff9ec';
  g.fillText('START  /  FINISH', W / 2, H / 2 - 2);
  g.shadowBlur = 0;

  g.fillStyle = '#ffc94d';
  g.fillRect(W / 2 - 250, H / 2 + 30, 500, 4);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ── 三条赛道：形状都是「极坐标 + 正弦扰动」，参数不同 → 弯道密度/半径不同 ──
// 注意：振幅 a1+a2 不能超过 R 太多，否则 CatmullRom 会自交（路面穿帮）。
export const TRACK_SHAPES = {
  coast: {
    id: 'coast', name: '黄昏海岸', desc: '原版环线 · 长弯多，适合练走线',
    R: 200, n: 12, a1: 55, a2: 38, b1: 14, b2: 9, f1: 1.7, f2: 2.3, g1: 0.9, g2: 1.4,
  },
  canyon: {
    id: 'canyon', name: '峡谷发卡', desc: '半径小、弯密 · 吃转向和氮气',
    R: 172, n: 14, a1: 62, a2: 44, b1: 26, b2: 16, f1: 2.4, f2: 3.3, g1: 1.3, g2: 1.9,
  },
  speedway: {
    id: 'speedway', name: '极速环道', desc: '大半径、弯缓 · 全程油门到底',
    R: 268, n: 10, a1: 24, a2: 16, b1: 8, b2: 5, f1: 1.2, f2: 1.6, g1: 0.6, g2: 1.0,
  },
};

export function buildTrack(scene, trackId) {
  const shape = TRACK_SHAPES[trackId] || TRACK_SHAPES.coast;
  const SEG = TRACK.segments;
  const ROAD_W = TRACK.roadWidth;
  const group = new THREE.Group();
  scene.add(group);

  // ── 闭合曲线（默认这条沿用原版形状）──
  const pts = [];
  const R = shape.R, n = shape.n;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = R + Math.sin(i * shape.f1) * shape.a1 + Math.cos(i * shape.f2) * shape.a2;
    const y = Math.sin(i * shape.g1) * shape.b1 + Math.cos(i * shape.g2) * shape.b2;
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
    // 起跑区（起终点线前后各 4 段）不画中线：发车格和起跑线要干净对称，
    // 车停在正中时中线正好从车身底下钻出来，看着特别别扭
    if (i <= 4 || i >= SEG - 4) continue;
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
      // 外沿一直铺到护栏基座里（9.14 > 护栏中心 9.1）：原来只到 8.85，
      // 与护栏之间空出 25 厘米，斜看就是一条能望见草坡的黑缝。
      const o1 = s * (ROAD_W / 2 + 0.02), o2 = s * (ROAD_W / 2 + 1.14);
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
      // 内沿从护栏基座外侧（9.12）才开始铺，和路肩、基座严丝合缝
      const o1 = sgn * (ROAD_W / 2 + 1.12), o2 = sgn * (ROAD_W / 2 + 46);
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

  // ── 护栏：混凝土基座 + 金属护栏带 + 立柱 ──
  // 老版只有一条悬空的金属带：底边在路面之上 0.45 米，而护栏所在位置的地面
  // （草坡外沿）比路面低约 0.19 米 —— 侧面看就是「一条飘在草地上方的带子」，
  // 底下一条 0.6 米宽的缝，车一过弯就露馅。
  // 现在拆成两段：基座从路面下 0.65 米一路砌到 0.42 米（草坡再起伏也被埋住），
  // 上面才是金属带；另外每 6 段压一根立柱，把「基座 / 地面 / 护栏」三层缝死。
  const RAIL_OFF = ROAD_W / 2 + 1.1;
  const BASE_TOP = 0.42;
  const BASE_BOT = -0.65;          // 沉到草坡之下，任何坡段都不会漏缝
  const RAIL_H = TRACK.railHeight;

  // 竖直带：给定上下两个相对路面的高度，沿整条曲线扫出双面四边形
  function buildBand(y0, y1) {
    const pos = [], idx = [];
    let ii = 0;
    for (let i = 0; i <= SEG; i++) {
      const { p, side } = frames[i];
      for (const s of [-1, 1]) {
        const b = p.clone().addScaledVector(side, s * RAIL_OFF);
        pos.push(b.x, b.y + y0, b.z, b.x, b.y + y1, b.z);
      }
      if (i > 0) {
        for (let k = 0; k < 2; k++) {
          const r0 = ii + k * 2, r1 = ii - 4 + k * 2;
          idx.push(r1, r1 + 1, r0, r1 + 1, r0 + 1, r0);
        }
      }
      ii += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // 基座（水泥矮墙）：粗糙、几乎不反光，才能把护栏「压」在地面上
  group.add(new THREE.Mesh(buildBand(BASE_BOT, BASE_TOP), new THREE.MeshStandardMaterial({
    color: 0xa9b2be, roughness: 0.96, metalness: 0.02, side: THREE.DoubleSide,
  })));
  // 金属带（波形板）
  group.add(new THREE.Mesh(buildBand(BASE_TOP, BASE_TOP + RAIL_H), new THREE.MeshStandardMaterial({
    color: 0xc3ccdb, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide,
  })));

  // 立柱：每 6 段一根（约 17 米），从地基撑到护栏顶
  {
    const step = 6;
    const list = [];
    for (let i = 0; i < SEG; i += step) list.push(i);
    const postTop = BASE_TOP + RAIL_H + 0.08;
    const postH = postTop - BASE_BOT;
    const postMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.17, postH, 0.17),
      new THREE.MeshStandardMaterial({ color: 0x8b95a4, roughness: 0.55, metalness: 0.55 }),
      list.length * 2
    );
    const pd = new THREE.Object3D();
    let pi = 0;
    for (const i of list) {
      const { p, side, tan } = frames[i];
      const rotY = Math.atan2(tan.x, tan.z);
      for (const s of [-1, 1]) {
        const b = p.clone().addScaledVector(side, s * RAIL_OFF);
        pd.position.set(b.x, b.y + (postTop + BASE_BOT) / 2, b.z);
        pd.rotation.set(0, rotY, 0);
        pd.scale.setScalar(1);
        pd.updateMatrix();
        postMesh.setMatrixAt(pi++, pd.matrix);
      }
    }
    postMesh.instanceMatrix.needsUpdate = true;
    group.add(postMesh);
  }

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
  // 老版立柱落在 ±6.4（路面之内），第三人称视角下两根柱子正好被裁到画面外，
  // 只剩一根 0.5 米粗的横梁悬在头顶 —— 玩家会以为「没有杆子」。
  // 现在立柱外移到路肩外侧、和护栏对齐，横梁加长，横幅换成带字的贴图。
  function addGate(frameIdx) {
    const f = frames[((frameIdx % SEG) + SEG) % SEG];
    // 横梁必须垂直于「它自己那一段」的赛道，立柱才会左右等距地落在路肩外
    const holder = new THREE.Group();
    holder.position.set(f.p.x, f.p.y, f.p.z);
    holder.rotation.y = Math.atan2(f.tan.x, f.tan.z);

    const postH = 9.2;
    const off = ROAD_W / 2 + 1.0;        // 立在护栏基座上，不再戳在沥青里
    const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b8, roughness: 0.4, metalness: 0.75 });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xff5560, emissive: 0xff3344, emissiveIntensity: 1.1, roughness: 0.4, toneMapped: false,
    });
    for (const s of [-1, 1]) {
      // 柱底往下多埋 0.5 米，坡道上也不会露出柱脚的缝
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, postH + 0.5, 10), postMat);
      post.position.set(s * off, (postH - 0.5) / 2, 0);
      holder.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), capMat);
      cap.position.set(s * off, postH + 0.18, 0);
      holder.add(cap);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(off * 2 + 0.8, 0.55, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x7c8798, roughness: 0.45, metalness: 0.7 })
    );
    beam.position.set(0, postH, 0);
    holder.add(beam);

    // 横梁下沿的灯带：夜赛 / 雨战里远远就能看见这条门架（toneMapped:false 保证不被压暗）
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(off * 2 + 0.6, 0.12, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xfff2c4, toneMapped: false })
    );
    lamp.position.set(0, postH - 0.36, 0);
    holder.add(lamp);

    // 横幅：正面朝来车。
    // PlaneGeometry 的正面朝 +Z，而 holder 已经把 +Z 转到「行进方向」，
    // 于是从车上看过去看到的是背面 —— 文字整个镜像（HNISIF / TRATS）。
    // 转 180° 让正面朝向来车，双面材质保证从终点往回看也不透。
    const banner3 = new THREE.Mesh(
      new THREE.PlaneGeometry(off * 2 - 0.4, 2.1),
      new THREE.MeshStandardMaterial({
        map: bannerTexture(), side: THREE.DoubleSide,
        roughness: 0.45, metalness: 0.05,
        emissive: 0x1a2431, emissiveIntensity: 0.55,
      })
    );
    banner3.position.set(0, postH - 1.55, 0);
    banner3.rotation.y = Math.PI;
    holder.add(banner3);

    holder.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    group.add(holder);
    return holder;
  }

  // 起终点：环形赛道只有「一条线 + 一座门架」，就画在 t=0（计圈点）上。
  // 之前起点线在 frames[3]、终点线在 frames[-3]，两条线夹着车只隔 18 米，
  // 俯视一眼就能看出是两套重复的标线；玩家起步时也分不清哪条是起跑线。
  addCheckerLine(0, 6, 6, 2);
  addGate(0);                    // 门架就架在起终点线上，两样是一体的


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

  // ── 环境染色：夜赛/雨战整体压暗路面与景物（贴图材质只能靠 color 乘子）──
  const tintMats = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !m.color || m.userData.__baseColor !== undefined) continue;
      m.userData.__baseColor = m.color.getHex();
      tintMats.push(m);
    }
  });
  function setTint(v) {
    for (const m of tintMats) {
      m.color.setHex(m.userData.__baseColor).multiplyScalar(v);
    }
  }

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

  return { id: shape.id, name: shape.name, curve, trackLen, group, posAt, curvatureAt, setTint, roadWidth: ROAD_W, segments: SEG, frames };
}
