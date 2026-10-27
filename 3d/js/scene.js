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

  const theme = { name: 'dark', sun, hemi, ambient, sky, skyUniforms, ground, envIntensity: 0.55 };

  function applyTheme(name) {
    const t = THEME[name] || THEME.dark;
    theme.name = name;
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
    envIntensity = t.envIntensity;
    // 背景层跟随主题
    const isLight = name === 'light';
    sunDiscMat.color.setHex(isLight ? 0xfff8e8 : 0xffd2a2);
    sunHaloMat.color.setHex(isLight ? 0xffe9c0 : 0xff9a5c);
    sunHaloMat.opacity = isLight ? 0.16 : 0.30;
    cloudMat.color.setHex(isLight ? 0xffffff : 0xffc6a4);
    cloudMat.opacity = isLight ? 0.42 : 0.10;
    starMat.opacity = isLight ? 0 : 0.85;
    ridgeFar.material.color.setHex(isLight ? 0xa9c6dc : 0x3a3268);
    ridgeMid.material.color.setHex(isLight ? 0x86aec5 : 0x2f3f5e);
    ridgeNear.material.color.setHex(isLight ? 0x6d977f : 0x26423f);
    document.body.className = name === 'light' ? 'light3d' : '';
  }

  let envIntensity = 0.55;
  // r160 没有 Scene.environmentIntensity，改为由各材质设 envMapIntensity，这里只记账
  function setEnvIntensity(v) { envIntensity = v; }

  const saved = store(KEYS.theme);
  applyTheme(saved === 'light' ? 'light' : 'dark');

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

  return { renderer, scene, camera, sun, hemi, ambient, theme, applyTheme, setEnvIntensity, getEnvIntensity: () => envIntensity, resize, followShadow, setGroundY, roadWidth: TRACK.roadWidth, dispose: () => { envRT.dispose(); pmrem.dispose(); } };
}
