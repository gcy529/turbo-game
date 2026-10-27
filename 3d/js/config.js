// ─────────────────────────────────────────────────────────────
// config.js · 全局可调参数
// 所有车辆、赛道、天气(日夜主题)、玩法数值集中在这里，改数值不改逻辑。
// ─────────────────────────────────────────────────────────────

export const CDN = {
  // three.js 锁定版本（ES module，走 importmap 注入）
  version: '0.160.0',
  base: 'https://registry.npmmirror.com/three/0.160.0/files/',
};

export const TRACK = {
  segments: 420,      // 赛道细分段数
  roadWidth: 16,      // 路面宽度
  baseRadius: 200,    // 环线基准半径
  dashEvery: 12,      // 中央白线：每 12 段画 5 段
  dashLen: 5,
  railHeight: 1.5,
  trees: 100,
  poles: 40,
};

export const CAR = {
  maxSpeed: 96,       // 内部速度上限
  accel: 42,
  brakeDecel: 70,
  coast: 16,
  minSpeed: -22,
  steerRate: 1.35,
  steerSpeedGain: 0.35,
  driftSpeedGain: 0.42,
  lateralLimit: 1.0,
  lateralHardLimit: 1.7,
  wallSlow: 0.55,
  maxRoll: 0.12,      // 侧倾上限（弧度）——超过这个值观感就假了
  rollLerp: 8,
  lookLerp: 10,
  wheelRadius: 0.45,
  flipUpLimit: 0.3,   // 车体局部 up.y 低于此值判定翻车 → 复位
};

export const RACE = {
  laps: 2,
  countdown: 3.2,
  hitDistance: 0.006, // NPC 碰撞的 t 距离阈值
  hitLateral: 0.62,
  hitCooldown: 0.8,
  hitSlow: 40,
  openAt: [2026, 10, 11], // 定时开放：2026-11-11（月份从 0 计）
};

export const NPC = {
  count: 18,
  colors: [0xff0066, 0x9944ff, 0xffaa00, 0x00ff88, 0xff3366, 0x44aaff],
  speedMin: 22,
  speedRange: 26,
  oncomingEvery: 3,
  oncomingMin: 26,
  oncomingRange: 22,
};

export const FX = {
  maxParticles: 300,
  skillItems: 12,
  skillTypes: ['shield', 'magnet', 'slow', 'megaboost'],
  skillColors: { shield: 0x4fc3f7, magnet: 0xef5350, slow: 0xab47bc, megaboost: 0xff9800 },
  skillDefs: {
    shield:    { name: '护盾', icon: '🛡️', cost: 50, duration: 5, color: 0x4fc3f7 },
    magnet:    { name: '磁力', icon: '🧲', cost: 40, duration: 6, color: 0xef5350 },
    slow:      { name: '缓时',   icon: '⏳', cost: 60, duration: 4, color: 0xab47bc },
    megaboost: { name: '氮气',   icon: '🔥', cost: 80, duration: 3, color: 0xff9800 },
  },
};

export const THEME = {
  // 黄昏：和 2D 版「黄昏海岸」同一套色感（深紫夜空 → 橙粉地平线）
  dark: {
    sky: [0x261f5c, 0xf0a878],
    fog: [0x8f7f92, 210, 700],
    sun: { color: 0xffc48f, intensity: 2.1 },
    hemi: { sky: 0x8c86c8, ground: 0x2b3a2c, intensity: 0.55 },
    ground: 0x28402f,
    envIntensity: 0.6,
  },
  light: {
    sky: [0x4f97e0, 0xdcecf8],
    fog: [0xdcecf8, 180, 720],
    sun: { color: 0xfff4e2, intensity: 3.0 },
    hemi: { sky: 0xffffff, ground: 0x8fa878, intensity: 1.0 },
    ground: 0x6f9a5c,
    envIntensity: 0.95,
  },
};

export const CAMERA = {
  fov: 70,
  fovBoost: 16,
  near: 0.5,
  far: 900,
  modes: [
    { name: '跟随', height: 3.6, dist: 9.6 },
    { name: '车头', height: 1.75, dist: 1.3 },
    { name: '远景', height: 9.2, dist: 16 },
  ],
};

// 2D 版共用的 localStorage 键名，重构后保持一致，存档互通
export const KEYS = {
  theme: 'turbo-racer-theme',
  name: 'turbo-racer-name',
  gyro: 'turbo-racer-gyro',
  invert: 'turbo3d-invert',
  unlocked: 'turbo3d-unlocked',
};

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
    return value;
  } catch (e) { return null; }
}
