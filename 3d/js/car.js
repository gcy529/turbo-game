// ─────────────────────────────────────────────────────────────
// car.js · 程序化车模（放样车身 + 独立轮胎轮毂 + 灯组 + 尾翼）与姿态控制
// 车模全部由几何体生成，不依赖任何外部模型/贴图文件。
// 姿态：四元数 lookAt(pos + fwd) + rotateZ(侧倾)，绝不写 rotation.z；
//       每帧检查车体局部 up.y，低于阈值即判定翻车并复位。
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR } from './config.js';

const _tmp = new THREE.Object3D();
const _v = new THREE.Vector3();

// 超椭圆断面：p 越小越方 —— 得到「宽而扁、四角圆润」的车身截面
function ring(hw, y0, y1, p, n) {
  const out = [], cy = (y0 + y1) / 2, ry = (y1 - y0) / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    out.push(new THREE.Vector2(
      Math.sign(c) * Math.pow(Math.abs(c), p) * hw,
      cy + Math.sign(s) * Math.pow(Math.abs(s), p) * ry
    ));
  }
  return out;
}

// 沿 Z 放样；splitGlass 时按段顶面斜率把前后风挡分到玻璃材质组
function loft(stations, ringN, splitGlass) {
  const rings = stations.map((s) => ring(s.hw, s.y0, s.y1, s.p || 0.62, ringN));
  const pos = [], paint = [], glass = [];
  for (let i = 0; i < stations.length; i++)
    for (let j = 0; j < ringN; j++) pos.push(rings[i][j].x, rings[i][j].y, stations[i].z);
  const isGlass = stations.slice(0, -1).map((s, i) =>
    !!splitGlass && Math.abs((stations[i + 1].y1 - s.y1) / (stations[i + 1].z - s.z)) > 0.3);
  for (let i = 0; i < stations.length - 1; i++) {
    const target = isGlass[i] ? glass : paint;
    for (let j = 0; j < ringN; j++) {
      const j2 = (j + 1) % ringN;
      const a = i * ringN + j, b = i * ringN + j2;
      const c = (i + 1) * ringN + j, d = (i + 1) * ringN + j2;
      target.push(a, b, c, b, d, c);
    }
  }
  const last = stations.length - 1;
  const capA = pos.length / 3, capB = capA + 1;
  pos.push(0, (stations[0].y0 + stations[0].y1) / 2, stations[0].z);
  pos.push(0, (stations[last].y0 + stations[last].y1) / 2, stations[last].z);
  for (let j = 0; j < ringN; j++) {
    const j2 = (j + 1) % ringN;
    paint.push(capA, j2, j, capB, last * ringN + j, last * ringN + j2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (splitGlass) {
    geo.setIndex([...paint, ...glass]);
    geo.addGroup(0, paint.length, 0);
    geo.addGroup(paint.length, glass.length, 1);
  } else geo.setIndex(paint);
  geo.computeVertexNormals();
  return geo;
}

/** 同材质静态网格合并：把一坨零件并成「一个材质一个 draw call」*/
function mergeByMaterial(root) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), drop = [];
  root.traverse((o) => {
    if (!o.isMesh || o.children.length || Array.isArray(o.material) || o.userData.keep) return;
    const list = buckets.get(o.material) || [];
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    list.push(g.index ? g : g.toNonIndexed());
    buckets.set(o.material, list);
    drop.push(o);
  });
  drop.forEach((o) => o.parent.remove(o));
  for (const [mat, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    root.add(Object.assign(new THREE.Mesh(merged, mat), { castShadow: true }));
  }
  return buckets.size;
}

function paintSet(color, detail) {
  const high = detail === 'high'; return {
    paint: new THREE.MeshPhysicalMaterial({ color, metalness: 0.62, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x06090d, metalness: 0.25, roughness: 0.04, transparent: true, opacity: 0.86, envMapIntensity: 1.9, side: THREE.DoubleSide }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x14171d, metalness: 0.45, roughness: 0.42, envMapIntensity: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc9d2e0, metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x0c0d11, metalness: 0.05, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: high ? 0x9fb0c4 : 0x8c96a6, metalness: 0.98, roughness: 0.24, envMapIntensity: 1.1 }),
    head: new THREE.MeshStandardMaterial({ color: 0xdfefff, emissive: 0x9fdcff, emissiveIntensity: 1.5, roughness: 0.12 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff2a4d, emissive: 0xff1436, emissiveIntensity: 1.6, roughness: 0.3 }),
    neon: new THREE.MeshBasicMaterial({ color: 0x00e0ff }),
  };
}

function addWheel(parent, name, x, z, M, high) {
  const R = CAR.wheelRadius;
  const holder = new THREE.Group();
  holder.name = name;
  holder.position.set(x, R, z);
  const spin = new THREE.Group();
  spin.name = name + '-spin';
  const tire = new THREE.Mesh(new THREE.TorusGeometry(R - 0.155, 0.155, 12, 26), M.tire);
  tire.rotation.y = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.17, R - 0.17, 0.26, 20), M.rim);
  rim.rotation.z = Math.PI / 2;
  spin.add(tire, rim);
  const spokes = high ? 6 : 4;
  for (let i = 0; i < spokes; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, (R - 0.26), 0.045), M.rim);
    sp.rotation.z = (i / spokes) * Math.PI * 2;
    sp.position.set(x > 0 ? 0.1 : -0.1, -(R - 0.26) / 2 + 0.02, 0);
    spin.add(sp);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10), high ? M.chrome : M.rim);
  cap.rotation.z = Math.PI / 2;
  cap.position.x = x > 0 ? 0.1 : -0.1;
  spin.add(cap);
  if (high) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.16, R - 0.16, 0.03, 18), M.chrome);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = x > 0 ? -0.06 : 0.06;
    spin.add(disc);
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), M.tail);
    caliper.position.set(x > 0 ? -0.07 : 0.07, 0.16, -0.12);
    spin.add(caliper);
  }
  tire.castShadow = true;
  mergeByMaterial(spin);   // 轮胎 / 轮毂 / 轮辐 各自并成一个 draw call
  holder.add(spin);
  parent.add(holder);
  return holder;
}

export function buildCar(color, detail = 'high') {
  const high = detail === 'high';
  const M = paintSet(color, detail);
  const car = new THREE.Group();
  const shell = new THREE.Group();
  car.add(shell);

  // 主车身：低趴楔形放样（由尾到首）
  const bodyStations = [
    { z: -2.18, hw: 0.60, y0: 0.24, y1: 0.56 }, { z: -1.78, hw: 0.90, y0: 0.13, y1: 0.72 },
    { z: -1.05, hw: 1.00, y0: 0.09, y1: 0.80 }, { z: -0.20, hw: 1.02, y0: 0.08, y1: 0.82 },
    { z: 0.65, hw: 1.00, y0: 0.09, y1: 0.76 },  { z: 1.45, hw: 0.99, y0: 0.11, y1: 0.60 },
    { z: 1.98, hw: 0.94, y0: 0.15, y1: 0.48 },  { z: 2.28, hw: 0.84, y0: 0.22, y1: 0.40 },
  ];
  const body = new THREE.Mesh(loft(bodyStations, 16, false), M.paint);
  body.castShadow = true;
  shell.add(body);

  // 座舱：同一放样，前后风挡按斜率自动分到玻璃材质
  const cabin = new THREE.Mesh(loft([
    { z: -1.62, hw: 0.66, y0: 0.72, y1: 0.80 }, { z: -1.28, hw: 0.78, y0: 0.74, y1: 1.20 },
    { z: -0.45, hw: 0.84, y0: 0.76, y1: 1.33 }, { z: 0.36, hw: 0.80, y0: 0.74, y1: 1.26 },
    { z: 0.92, hw: 0.72, y0: 0.72, y1: 1.00 },  { z: 1.24, hw: 0.58, y0: 0.70, y1: 0.76 },
  ], 16, true), [M.paint, M.glass]);
  cabin.castShadow = true;
  shell.add(cabin);

  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 1.5), M.glass);
    win.position.set(s * 0.83, 1.0, -0.35); win.rotation.z = s * 0.06;
    shell.add(win);
    for (const z of [1.45, -1.45]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(CAR.wheelRadius + 0.11, 0.075, 6, 14, Math.PI), M.paint);
      arch.position.set(s * 0.96, CAR.wheelRadius, z);
      arch.rotation.y = Math.PI / 2;
      arch.castShadow = true;
      shell.add(arch);
    }
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 2.1), M.carbon);
    skirt.position.set(s * 1.0, 0.16, 0);
    shell.add(skirt);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 2.3), M.neon);
    sill.position.set(s * 1.03, 0.235, 0);
    shell.add(sill);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.05), M.head);
    lens.position.set(s * 0.56, 0.6, 2.24);
    shell.add(lens);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.05), M.head);
    brow.position.set(s * 0.56, 0.69, 2.24); shell.add(brow);
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.05), M.head);
    drl.position.set(s * 0.5, 0.44, 2.24);
    shell.add(drl);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.05), M.tail);
    lamp.position.set(s * 0.55, 0.5, -2.22);
    shell.add(lamp);
  }
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.06, 0.34), M.carbon);
  splitter.position.set(0, 0.17, 2.06);
  shell.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.44), M.carbon);
  diffuser.position.set(0, 0.2, -2.06);
  shell.add(diffuser);
  for (let i = -1; i <= 1; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.4), M.carbon);
    fin.position.set(i * 0.45, 0.24, -2.06);
    shell.add(fin);
  }
  for (const s2 of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), M.carbon);
    intake.position.set(s2 * 0.72, 0.4, 2.18); shell.add(intake);
  }
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.06), M.tail);
  tailBar.position.set(0, 0.62, -2.24);
  shell.add(tailBar);

  if (high) {
    for (const s of [-1, 1]) {
      const stay = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.1), M.carbon);
      stay.position.set(s * 0.6, 0.84, -1.9);
      shell.add(stay);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.12), M.carbon);
      mirror.position.set(s * 0.98, 1.0, 0.62);
      shell.add(mirror);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.18, 12), M.chrome);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(s * 0.42, 0.3, -2.24);
      shell.add(pipe);
    }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.055, 0.36), M.carbon);
    wing.position.set(0, 0.99, -1.94);
    wing.rotation.x = 0.16;
    wing.castShadow = true;
    shell.add(wing);
  }

  car.add(addWheel(car, 'wheelFL', -0.86, 1.45, M, high), addWheel(car, 'wheelFR', 0.86, 1.45, M, high));
  car.add(addWheel(car, 'wheelRL', -0.86, -1.45, M, high), addWheel(car, 'wheelRR', 0.86, -1.45, M, high));
  mergeByMaterial(shell);  // 车身零件按材质合并，draw call 从 ~28 降到 ~8
  car.userData = { mats: M, detail };
  refreshParts(car);
  return car;
}

/** 克隆后重挂部件引用（Object3D.clone 不保留带引用的 userData）*/
export function refreshParts(car) {
  car.userData = car.userData || {};
  car.userData.wheels = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR']
    .map((n) => car.getObjectByName(n)).filter(Boolean);
  return car.userData;
}

export function cloneCar(src) {
  const c = src.clone(true);
  c.userData = { mats: src.userData.mats, detail: src.userData.detail };
  refreshParts(c);
  return c;
}

/** 车模姿态：车头朝实际行驶方向；侧倾合进四元数；翻车自动复位 */
export function poseCar(car, pos, fwd, roll, dt, snap) {
  car.position.copy(pos);
  _tmp.position.copy(pos);
  _tmp.up.set(0, 1, 0);
  // 修正点：目标必须是「车身前方」= pos + fwd（旧版写成 pos - fwd，车头朝后）
  _tmp.lookAt(pos.x + fwd.x, pos.y + fwd.y, pos.z + fwd.z);
  _tmp.rotateZ(roll); // 侧倾写进四元数，绝不再碰 rotation.z
  car.quaternion.slerp(_tmp.quaternion, snap ? 1 : Math.min(1, dt * CAR.lookLerp));
  _v.set(0, 1, 0).applyQuaternion(car.quaternion);
  let recovered = false;
  if (_v.y < CAR.flipUpLimit) {
    car.quaternion.copy(_tmp.quaternion); // 翻车兜底：直接摆正，立刻能继续开
    _v.set(0, 1, 0).applyQuaternion(car.quaternion);
    recovered = true;
  }
  car.updateMatrixWorld();
  return { upY: _v.y, recovered };
}

export const headingOf = (car, out) => (out || new THREE.Vector3()).set(0, 0, 1).applyQuaternion(car.quaternion);

export function updateWheels(car, speed, dt, steer) {
  const wheels = (car.userData && car.userData.wheels) || [];  // 四个轮子（克隆后由 refreshParts 重建）
  for (const w of wheels) {
    const spin = w.getObjectByName(w.name + '-spin');
    if (spin) spin.rotation.x -= speed * dt * 0.9;
    if (steer && (w.name === 'wheelFL' || w.name === 'wheelFR')) w.rotation.y = steer * 0.32;
  }
}

export function applyEnvIntensity(car, v) {
  const mats = (car.userData && car.userData.mats) || {};
  for (const k in mats) if (mats[k].envMapIntensity !== undefined) mats[k].envMapIntensity = k === 'glass' ? v * 1.8 : v;
}

export function setBrake(car, on) {
  const tail = car.userData && car.userData.mats && car.userData.mats.tail;
  if (tail) tail.emissiveIntensity = on ? 3.4 : 1.6;
}
