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
    float k = pow(h, 0.85);
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
  renderer.toneMappingExposure = 1.05;

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

  // ── 地面（接收阴影，避免车像浮在空中）──
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(880, 64),
    new THREE.MeshStandardMaterial({ color: 0x101a2a, roughness: 0.95, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.4;
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
  function setGroundY(y) { ground.position.y = y - 2.6; }

  return { renderer, scene, camera, sun, hemi, ambient, theme, applyTheme, setEnvIntensity, getEnvIntensity: () => envIntensity, resize, followShadow, setGroundY, roadWidth: TRACK.roadWidth, dispose: () => { envRT.dispose(); pmrem.dispose(); } };
}
