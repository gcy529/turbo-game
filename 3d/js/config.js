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
  lateralHardLimit: 1.12,
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
  // 碰撞改成「车体椭圆」实测（原来用 t/lateral 参数近似，弯道刻度失真 → 隔空撞 / 贴脸不撞）
  hitAlong: 4.3,      // 沿赛道切线的半长之和（两车长加起来约 4.6）
  hitSide: 1.85,      // 垂直赛道的半宽之和（两车宽加起来约 1.9）
  hitCooldown: 1.1,   // 撞一次后的无敌时间，避免连环判定把速度打没
  hitSlow: 0.55,      // 按相对速度比例削速
  openAt: [2026, 10, 11], // 定时开放：2026-11-11（月份从 0 计）
};

export const NPC = {
  count: 14,
  colors: [0xff0066, 0x9944ff, 0xffaa00, 0x00ff88, 0xff3366, 0x44aaff],
  speedMin: 22,
  speedRange: 26,
  oncomingEvery: 5,
  oncomingMin: 26,
  oncomingRange: 22,
};

export const FX = {
  maxParticles: 300,
  // ── 赛道金币（技能系统已下线，改为拾取金币解锁）──
  coinCount: 24,        // 每圈撒多少枚
  coinValue: 3,         // 每枚值多少币
  coinColors: [0xffc93c, 0xffe082, 0xffab00],
  coinRadius: 3.0,      // 拾取半径（米）
};

// ── 氮气：漂移集气 → 点按释放（与 2D 版同一套手感）──
export const NITRO = {
  segs: 3,              // 最多 3 格
  time: 2.0,            // 每格喷 2 秒
  boost: 1.35,          // 喷射时极速倍率
  gainDrift: 0.55,      // 漂移每秒集气（格）
  gainCoin: 0.12,       // 吃一枚金币顺带集气
  tapMs: 260,           // 按下多久内抬起算「点一下」
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

// ── 驾驶辅助：自动油门常开（手机单手不用管油门），智驾 = 自动走线 + 避车 ──
export const DRIVE = {
  autopilot: false,      // 默认手动转向；HUD 上「智驾」一按就托管
  lookAhead: 0.055,      // 弯道前瞻（占整圈比例）
  innerLine: 0.55,       // 走内线的横向幅度
  avoidSide: 0.7,        // 避车时让开的横向距离
  avoidRange: 80,        // 避车前瞻（米）——96 速下 80 米≈0.8 秒，够打一次方向
  avoidGap: 0.9,         // 横向多近才需要躲
};

export const CAMERA = {
  fov: 70,
  fovBoost: 16,
  near: 0.5,
  far: 900,
  modes: [
    { name: '跟随', height: 3.6, dist: 9.6 },
    // 车头视角：dist 为负 = 相机挪到车头前面，真正第一人称；
    // 原来是 +1.3（在车尾后面贴着），半屏都被自己的车顶挡住。
    { name: '车头', height: 1.3, dist: -2.5 },
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
  autopilot: 'turbo3d-autopilot',
};

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
    return value;
  } catch (e) { return null; }
}
