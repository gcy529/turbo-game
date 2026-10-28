// ─────────────────────────────────────────────────────────────
// scene.js · 渲染器 / 场景 / 相机 / 灯光 / 日夜主题 / 环境反射
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRACK, THEME, CAMERA, KEYS, store } from './config.js';

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const SKY_FRAG = /* glsl */`
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    float k = pow(h, 0.42);   // 只有贴近地平线才暖，高处保持深紫
    gl_FragColor = vec4(mix(horizonColor, topColor, k), 1.0);
  }`;

export function createStage(canvas) {
  const W = window.innerWidth, H = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // 手机普及：pixelRatio 上限 1.5，省填充率
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, W / H, CAMERA.near, CAMERA.far);
  camera.position.set(0, 6, -14);
  camera.lookAt(0, 1, 0);

  // ── 天空穹顶（程序化渐变，不依赖任何贴图文件）──
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x0b1230) },
    horizonColor: { value: new THREE.Color(0x1a2444) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(760, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    })
  );
  scene.add(sky);

  // ═════════════════════════════════════════════════════════════
  // 背景层重做：太阳圆盘 / 云带 / 三层远山 / 星空
  // 原来只有一层深蓝天幕 + 空地面，远处一片黑，看着像半成品
  // ═════════════════════════════════════════════════════════════
  const backdrop = new THREE.Group();
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  // 太阳：圆盘 + 加色光晕，固定在世界方向（远处，不受雾影响）
  const sunDiscMat = new THREE.MeshBasicMaterial({ color: 0xffd0a0, fog: false, transparent: true, opacity: 0.96 });
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(44, 48), sunDiscMat);
  const sunHaloMat = new THREE.MeshBasicMaterial({
    color: 0xff9a5c, fog: false, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sunHalo = new THREE.Mesh(new THREE.CircleGeometry(150, 48), sunHaloMat);
  const sunDir = new THREE.Vector3(-0.55, 0.26, -0.79).normalize();
  sunDisc.position.copy(sunDir).multiplyScalar(700);
  sunHalo.position.copy(sunDir).multiplyScalar(699);
  sunDisc.lookAt(0, 0, 0); sunHalo.lookAt(0, 0, 0);
  backdrop.add(sunHalo, sunDisc);

  // 云带：压扁的球，半透明，环状分布
  const cloudGeo = new THREE.SphereGeometry(1, 12, 8);
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffc9a8, transparent: true, opacity: 0.10, fog: false, depthWrite: false,
  });
  const CLOUDS = 44;
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUDS);
  {
    const d = new THREE.Object3D();
    for (let i = 0; i < CLOUDS; i++) {
      const a = (i / CLOUDS) * Math.PI * 2 + Math.random() * 0.5;
      const r = 300 + Math.random() * 340;
      const y = 95 + Math.random() * 150;
      const sx = 16 + Math.random() * 34;
      d.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      d.scale.set(sx, sx * (0.16 + Math.random() * 0.12), sx * (0.5 + Math.random() * 0.4));
      d.rotation.y = a;
      d.updateMatrix();
      clouds.setMatrixAt(i, d.matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
  }
  clouds.renderOrder = -1;
  backdrop.add(clouds);

  // 远山：三层低多边形山脊，越远越淡
  function ridge(radius, count, hMin, hMax, color, seed) {
    const geo = new THREE.ConeGeometry(1, 1, 5, 1);
    const mat = new THREE.MeshBasicMaterial({ color, fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (seed % 1) * 0.4;
      const r = radius * (0.86 + Math.random() * 0.3);
      const h = hMin + Math.random() * (hMax - hMin);
      const w = h * (1.1 + Math.random() * 0.9);
      d.position.set(Math.cos(a) * r, -40 + h / 2, Math.sin(a) * r);
      d.scale.set(w, h, w);
      d.rotation.y = Math.random() * Math.PI;
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    backdrop.add(mesh);
    return mesh;
  }
  const ridgeFar = ridge(700, 46, 70, 150, 0x453c78, 0.3);
  const ridgeMid = ridge(620, 40, 48, 108, 0x353f66, 0.7);
  const ridgeNear = ridge(540, 30, 26, 66, 0x2c4d45, 0.1);

  // 星空（只在夜色主题显示）
  const starGeo = new THREE.BufferGeometry();
  {
    const N = 420, arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.18 + Math.random() * 0.78;
      const rr = Math.sqrt(Math.max(0, 1 - y * y)) * 760;
      arr[i * 3] = Math.cos(a) * rr;
      arr[i * 3 + 1] = y * 760;
      arr[i * 3 + 2] = Math.sin(a) * rr;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  }
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  backdrop.add(stars);

  // ── 地面（接收阴影，避免车像浮在空中）──
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(880, 64),
    new THREE.MeshStandardMaterial({ color: 0x101a2a, roughness: 0.95, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -60;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── 灯光 ──
  const hemi = new THREE.HemisphereLight(0x99bbff, 0x223311, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffddaa, 2.6);
  sun.position.set(90, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.AmbientLight(0x404060, 0.5);
  scene.add(ambient);

  // ── 环境反射：用 PMREM 烘焙程序化房间环境，金属漆才有层次 ──
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(renderer), 0.04);
  scene.environment = envRT.texture;

  // ── 雨幕（雨战才显示）：700 条短线段，比圆点更像雨 ──
  const RAIN_N = 700;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_N * 6);
  const rainSpeed = new Float32Array(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) {
    const x = (Math.random() - 0.5) * 80, y = Math.random() * 46, z = (Math.random() - 0.5) * 80;
    const len = 0.7 + Math.random() * 0.7;
    rainPos[i * 6] = x; rainPos[i * 6 + 1] = y + len; rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x; rainPos[i * 6 + 4] = y; rainPos[i * 6 + 5] = z;
    rainSpeed[i] = 42 + Math.random() * 26;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0xbfd8f0, transparent: true, opacity: 0.38, depthWrite: false, fog: false,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);

  // ── 车灯：只做「光锥 + 地面亮斑」，不用 SpotLight ──
  //    为什么不用聚光灯：两盏 SpotLight 会让每个材质都多算一遍光照，
  //    软件渲染下直接掉到 2fps（倒计时都走不完）。光锥在暗场景里够看，且零光照成本。
  const headlights = new THREE.Group();
  // 体积光锥：只有 SpotLight 在暗场景里几乎看不出来，加两个 additive 锥体做「光柱」
  const beamGeo = new THREE.ConeGeometry(2.4, 14, 14, 1, true);
  beamGeo.rotateX(-Math.PI / 2);
  beamGeo.translate(0, 0, 8.2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffeec2, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const beamL = new THREE.Mesh(beamGeo, beamMat);
  const beamR = new THREE.Mesh(beamGeo, beamMat);
  beamL.position.set(-0.55, 0.55, 0);
  beamR.position.set(0.55, 0.55, 0);
  beamL.rotation.x = 0.055;      // 稍微压低，让光柱落到路面而不是飘在空中
  beamR.rotation.x = 0.055;
  // 光锥做短做窄：全屏 additive 在弱 GPU 上 overdraw 很贵，14 米、半径 2.4 基本只看车头前一段
  headlights.add(beamL, beamR);
  // 车头前方的地面亮斑：让「照着路」有落点，而不是只有两条飘在空中的光柱
  const glowGeo = new THREE.CircleGeometry(5.2, 24);
  glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffeec2, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  });
  const groundGlow = new THREE.Mesh(glowGeo, glowMat);
  groundGlow.position.set(0, -0.55, 10);
  headlights.add(groundGlow);
  headlights.visible = false;
  scene.add(headlights);

  const theme = { name: 'dark', sun, hemi, ambient, sky, skyUniforms, ground, envIntensity: 0.55, grip: 1 };

  function applyTheme(name) {
    const t = THEME[name] || THEME.dark;
    theme.name = name;
    theme.grip = t.grip || 1;
    // 夜赛/雨战整体压暗：路面和树是固定贴图，只能靠曝光调
    renderer.toneMappingExposure = t.exposure === undefined ? 0.96 : t.exposure;
    skyUniforms.topColor.value.setHex(t.sky[0]);
    skyUniforms.horizonColor.value.setHex(t.sky[1]);
    scene.fog = new THREE.Fog(t.fog[0], t.fog[1], t.fog[2]);
    sun.color.setHex(t.sun.color);
    sun.intensity = t.sun.intensity;
    hemi.color.setHex(t.hemi.sky);
    hemi.groundColor.setHex(t.hemi.ground);
    hemi.intensity = t.hemi.intensity;
    ground.material.color.setHex(t.ground);
    ambient.color.setHex(name === 'light' ? 0x9fb4cc : 0x404060);
    ambient.intensity = name === 'night' ? 0.22 : 0.5;
    envIntensity = t.envIntensity;

    // 背景层跟随环境
    const isLight = name === 'light';
    const isNight = !!t.night;
    const isRain = !!t.rain;
    if (isNight) {
      // 夜色：太阳盘换成月亮，光晕收敛成冷白，云基本看不见
      sunDiscMat.color.setHex(0xdfe8ff);
      sunHaloMat.color.setHex(0x8fa8e0);
      sunHaloMat.opacity = 0.18;
      cloudMat.color.setHex(0x2a3550);
      cloudMat.opacity = 0.05;
      ridgeFar.material.color.setHex(0x0e1428);
      ridgeMid.material.color.setHex(0x0a1020);
      ridgeNear.material.color.setHex(0x081410);
      starMat.opacity = 1;
    } else if (isRain) {
      sunDiscMat.color.setHex(0xd8e2ec);
      sunHaloMat.color.setHex(0x9fb0c0);
      sunHaloMat.opacity = 0.08;
      cloudMat.color.setHex(0x8695a2);
      cloudMat.opacity = 0.5;
      ridgeFar.material.color.setHex(0x5a6b78);
      ridgeMid.material.color.setHex(0x4a5a66);
      ridgeNear.material.color.setHex(0x435246);
      starMat.opacity = 0;
    } else {
      sunDiscMat.color.setHex(isLight ? 0xfff8e8 : 0xffd2a2);
      sunHaloMat.color.setHex(isLight ? 0xffe9c0 : 0xff9a5c);
      sunHaloMat.opacity = isLight ? 0.16 : 0.30;
      cloudMat.color.setHex(isLight ? 0xffffff : 0xffc6a4);
      cloudMat.opacity = isLight ? 0.42 : 0.10;
      starMat.opacity = isLight ? 0 : 0.85;
      ridgeFar.material.color.setHex(isLight ? 0xa9c6dc : 0x3a3268);
      ridgeMid.material.color.setHex(isLight ? 0x86aec5 : 0x2f3f5e);
      ridgeNear.material.color.setHex(isLight ? 0x6d977f : 0x26423f);
    }
    rain.visible = isRain;
    headlights.visible = isNight;
    beamMat.opacity = isNight ? 0.05 : 0;
    groundGlow.visible = isNight;
    document.body.className = isLight ? 'light3d' : (isNight ? 'night3d' : (isRain ? 'rain3d' : ''));
  }

  // 车灯跟随车身（夜赛每帧调用）
  function syncLights(pos, quat) {
    if (!headlights.visible) return;
    headlights.position.copy(pos);
    headlights.position.y += 0.15;
    headlights.quaternion.copy(quat);
  }

  // 雨点下落 + 围绕车身循环（雨战每帧调用）
  function updateRain(dt, center) {
    if (!rain.visible) return;
    const arr = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 6;
      const drop = rainSpeed[i] * dt;
      arr[o + 1] -= drop;
      arr[o + 4] -= drop;
      if (arr[o + 4] < center.y - 2) {
        const len = 0.7 + (i % 7) * 0.09;
        const x = center.x + (Math.random() - 0.5) * 76;
        const z = center.z + (Math.random() - 0.5) * 76;
        const y = center.y + 22 + Math.random() * 22;
        arr[o] = x; arr[o + 1] = y + len; arr[o + 2] = z;
        arr[o + 3] = x; arr[o + 4] = y; arr[o + 5] = z;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  function grip() { return theme.grip; }

  let envIntensity = 0.55;
  // r160 没有 Scene.environmentIntensity，改为由各材质设 envMapIntensity，这里只记账
  function setEnvIntensity(v) { envIntensity = v; }

  const saved = store(KEYS.theme);
  applyTheme(THEME[saved] ? saved : 'dark');

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // 阴影相机跟随玩家：只照附近，远处不浪费精度
  function followShadow(pos) {
    sun.position.set(pos.x + 26, pos.y + 42, pos.z + 20);
    sun.target.position.copy(pos);
    sun.target.updateMatrixWorld();
  }

  // 赛道地平线遮挡更自然：把地面抬高一点跟随赛道高度
  function setGroundY(y) { /* 大平面固定在最底，不再跟随玩家高度 */ }

  return { renderer, scene, camera, sun, hemi, ambient, theme, applyTheme, setEnvIntensity, getEnvIntensity: () => envIntensity, grip, syncLights, updateRain, resize, followShadow, setGroundY, roadWidth: TRACK.roadWidth, dispose: () => { envRT.dispose(); pmrem.dispose(); } };
}
