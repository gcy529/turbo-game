// ─────────────────────────────────────────────────────────────
// main.js · 装配与主循环（状态机 / 圈数 / NPC / 碰撞 / 相机 / 测试接口）
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CAR, RACE, NPC, CAMERA, FX, NITRO, DRIVE, KEYS, THEME, store } from './config.js';
import { createStage } from './scene.js';
import { buildTrack, TRACK_SHAPES } from './track.js';
import { buildCar, poseCar, headingOf, updateWheels, applyEnvIntensity, setBrake } from './car.js';
import { createInput } from './input.js';
import { createParticles, createCoins } from './fx.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { readProfile, buyLivery, selectLivery, addCoins, bumpStats } from './profile.js';

const canvas = document.getElementById('game');
const stage = createStage(canvas);
// 赛道可切换（三条），所以 track / coins 都是 let，切换时整体重建
let track = buildTrack(stage.scene, store('turbo3d-track') || 'coast');
const hud = createHud();
const audio = createAudio();
const particles = createParticles(stage.scene);
// ── 车库：3D 入口免费，车漆用金币解锁（和 2D 共用同一份档案）──
const profile = readProfile();
const LIVERIES = [
  { id: 'mint',   name: '薄荷', color: 0x00ffcc, price: 0 },
  { id: 'violet', name: '紫电', color: 0xbf00ff, price: 1500 },
  { id: 'gold',   name: '赤金', color: 0xffc93c, price: 3000 },
];
function liveryById(id) { return LIVERIES.find(l => l.id === id) || LIVERIES[0]; }

let playerCar = buildCar(liveryById(profile.livery).color, 'high');
stage.scene.add(playerCar);

// 赛道金币（技能系统已下线：不再有技能点/道具，改为直接捡钱）
let coins = createCoins(stage.scene, track);

function applyLivery() {
  const l = liveryById(profile.livery);
  if (playerCar.parent) playerCar.parent.remove(playerCar);
  playerCar = buildCar(l.color, 'high');
  stage.scene.add(playerCar);
  renderGarage();
}

function renderGarage() {
  const coinEl = document.getElementById('g3coins');
  const idEl = document.getElementById('g3id');
  const row = document.getElementById('liveryRow3d');
  if (coinEl) coinEl.textContent = String(profile.coins);
  if (idEl) idEl.textContent = profile.id;
  hud.setCoinBalance(profile.coins);
  if (!row) return;
  row.innerHTML = '';
  LIVERIES.forEach((l) => {
    const owned = profile.liveries.indexOf(l.id) >= 0;
    const on = profile.livery === l.id;
    const b = document.createElement('button');
    b.className = 'livery' + (on ? ' on' : '') + (owned ? '' : ' locked');
    b.innerHTML = '<span class="sw" style="background:#' + l.color.toString(16).padStart(6, '0') + '"></span>' +
      l.name + (owned ? '' : '<small>🔒 ' + l.price + ' 币</small>');
    b.addEventListener('click', () => {
      if (profile.liveries.indexOf(l.id) < 0) {
        const res = buyLivery(profile, l);
        if (res === 'poor') { hud.setMsg('金币不足 · 还差 ' + (l.price - profile.coins) + ' 币', 1.6); return; }
        hud.setMsg('已解锁「' + l.name + '」', 1.4);
      }
      if (selectLivery(profile, l)) applyLivery();
    });
    row.appendChild(b);
  });
}

// ── 环境：黄昏 / 白天 / 夜赛 / 雨战 ──
const ENV_ORDER = ['dark', 'light', 'night', 'rain'];
const ENV_ICON = { dark: '🌗', light: '☀️', night: '🌙', rain: '🌧' };
function renderEnvRow() {
  const row = document.getElementById('envRow3d');
  if (!row) return;
  row.innerHTML = '';
  ENV_ORDER.forEach((id) => {
    const t = THEME[id];
    if (!t) return;
    const b = document.createElement('button');
    b.className = 'trackChip' + (id === stage.theme.name ? ' on' : '');
    b.textContent = (ENV_ICON[id] || '') + ' ' + (t.label || id);
    b.addEventListener('click', () => setEnv(id));
    row.appendChild(b);
  });
}
// 夜赛把路面压暗（贴图材质只能靠 color 乘子），雨天略暗
function applyTrackTint() {
  const n = stage.theme.name;
  track.setTint(n === 'night' ? 0.40 : (n === 'rain' ? 0.74 : 1));
}
function setEnv(id) {
  if (!THEME[id]) return false;
  stage.applyTheme(id);
  store(KEYS.theme, id);
  refreshEnvIntensity();
  applyTrackTint();
  renderEnvRow();
  if (window.__syncSettings) window.__syncSettings();
  const note = id === 'night' ? '车灯开启' : (id === 'rain' ? '湿滑路面 · 抓地 -10%' : '');
  hud.setMsg((THEME[id].label || id) + (note ? ' · ' + note : ''), 1.6);
  return true;
}

// 赛道选择：三条，点一下就换（跑着的时候不让点，免得车穿到新路面外面）
function renderTrackRow() {
  const row = document.getElementById('trackRow3d');
  if (!row) return;
  row.innerHTML = '';
  Object.keys(TRACK_SHAPES).forEach((id) => {
    const s = TRACK_SHAPES[id];
    const b = document.createElement('button');
    b.className = 'trackChip' + (id === track.id ? ' on' : '');
    b.textContent = s.name;
    b.title = s.desc || '';
    b.addEventListener('click', () => {
      if (running) { hud.setMsg('比赛中不能换赛道', 1.2); return; }
      switchTrack(id);
    });
    row.appendChild(b);
  });
  const best = loadBestLap();
  const bl = document.getElementById('bestLap3d');
  if (bl) bl.textContent = best > 0 ? ('本赛道最佳圈 ' + best.toFixed(2) + 's') : '本赛道最佳圈 --（跑完一圈就有了）';
}
renderGarage();
renderTrackRow();
renderEnvRow();
applyTrackTint();
const npcs = [];

// 起终点线在 t=0（计圈点），车停在它后面 4.5 米 —— 和真赛道一样：
// 车趴在起跑格上，前方就是那条黑白线和门架。
// t 为负不影响渲染（posAt/curvatureAt 都做过归一化），只需跳过「起步出线」这一下。
const START_BACK = 7.5;
let START_T = -START_BACK / track.trackLen;
function startT() { return -START_BACK / track.trackLen; }

const player = {
  t: START_T, lateral: 0, speed: 0, lap: 1, totalLaps: RACE.laps, lastT: START_T,
  armed: false,         // 起步后第一次压过起终点线：只算「出发」，不算一圈
  finished: false, finishTime: 0, smashCount: 0, hitCooldown: 0,
  driftScore: 0, pushLateral: 0, recovered: 0,
  // ── 金币 / 氮气 ──
  coinGot: 0,           // 本局拾取金币数
  coinsEarned: 0,       // 本局进入结算的金币总额
  charge: 0,            // 氮气：0..NITRO.segs 格
  nitroTimer: 0,        // 喷射剩余时间
  nitroFlash: 0,        // 释放闪光
  // ── 名次 / 本局成绩（结算用）──
  prog: 0,              // 本局累计里程（米），和 NPC 同尺度比名次
  topSpeed: 0,          // 本局最高速
  bestLap: 0,           // 本局最快单圈
  rank: 0,              // 当前名次（只算同向车）
  rankTotal: 12,
  bestRank: 0,          // 本局最好名次
  overtakes: 0,         // 净超越数
};
let running = false, camMode = 0, clock = 0, countdown = 0, raceClock = 0, lapStartClock = 0, shake = 0, roll = 0;
let paused = false;

// ── 智驾（自动驾驶）：自动走内线 + 避让 NPC，玩家一按方向就临时接管 ──
let autopilot = store(KEYS.autopilot) === '1';

/** 返回 -1..1 的转向量，和手动输入同一条通道 */
function autoSteer() {
  // 1) 前瞻：只取「最近的显著弯」，远处最急弯不该让车一路贴边
  let curve = 0, bestScore = 0;
  const N = 8;
  for (let i = 1; i <= N; i++) {
    const c = track.curvatureAt(player.t + DRIVE.lookAhead * (i / N));
    const score = Math.abs(c) * (1 - (i / N) * 0.55);      // 近处权重更高
    if (score > bestScore) { bestScore = score; curve = c; }
  }
  let target = Math.max(-DRIVE.innerLine, Math.min(DRIVE.innerLine, curve * 13));

  // 2) 避车：只躲「同一纵向走廊」里前方 2~80 米的车，往空的一侧让
  //    （原来按 target 算 gap，几乎每辆车都算「要躲」，于是左右横跳把自己甩到墙上）
  for (const n of npcs) {
    let dt2 = n.t - player.t;
    if (dt2 < -0.5) dt2 += 1;
    if (dt2 > 0.5) dt2 -= 1;
    const along = dt2 * track.trackLen;
    if (along < 2 || along > DRIVE.avoidRange) continue;
    if (Math.abs(n.lateral - player.lateral) > DRIVE.avoidGap) continue;
    target = n.lateral > player.lateral ? n.lateral - DRIVE.avoidSide : n.lateral + DRIVE.avoidSide;
    break;
  }
  // 3) 快贴墙了先回中，避车让位不能把人顶到护栏上
  if (Math.abs(player.lateral) > 0.86) target *= 0.25;
  target = Math.max(-0.86, Math.min(0.86, target));

  // 3) 方向控制：偏差越大打得越狠，进死区不打方向
  const diff = target - player.lateral;
  if (Math.abs(diff) < 0.045) return 0;
  return Math.sign(diff) * Math.min(1, Math.abs(diff) * 5.5);
}

function setAutopilot(v, silent) {
  autopilot = !!v;
  store(KEYS.autopilot, autopilot ? '1' : '0');
  const ab = document.getElementById('autoBtn3d');
  if (ab) {
    ab.textContent = autopilot ? '智驾' : '手动';
    ab.classList.toggle('on', autopilot);
    ab.title = autopilot ? '智驾中：自动走线避车（按方向键可临时接管）' : '手动驾驶：自己打方向';
  }
  if (!silent) hud.setMsg(autopilot ? '智驾开启 · 自动走线避车' : '切回手动驾驶', 1.4);
}

function spawnNpcs() {
  for (let i = 0; i < NPC.count; i++) {
    const car = buildCar(NPC.colors[i % NPC.colors.length], 'low');
    const oncoming = i % NPC.oncomingEvery === 0;
    const npc = {
      mesh: car,
      t: 0.06 + Math.random() * 0.88,   // 别生成在起步位置，否则第一帧就有一辆车糊在镜头上
      lateral: (Math.random() - 0.5) * 1.4,
      speed: oncoming ? -(NPC.oncomingMin + Math.random() * NPC.oncomingRange) : NPC.speedMin + Math.random() * NPC.speedRange,
      oncoming, laps: 0, prog: 0,
    };
    stage.scene.add(car);
    npcs.push(npc);
  }
  refreshEnvIntensity();
}
/** 换赛道后只需要重抽位置/速度，车模复用（重建 14 台车太浪费） */
function respawnNpcs() {
  for (const n of npcs) {
    n.t = 0.06 + Math.random() * 0.88;
    n.lateral = (Math.random() - 0.5) * 1.4;
    n.speed = n.oncoming ? -(NPC.oncomingMin + Math.random() * NPC.oncomingRange) : NPC.speedMin + Math.random() * NPC.speedRange;
    n.laps = 0;
    n.prog = n.t * track.trackLen;
  }
}
/** 递归释放几何与材质（换赛道时旧路面不释放会一直涨显存） */
function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}

// ── 赛道纪录：只存数字（不做幽灵车），按赛道分开记 ──
function loadBestLap() {
  try { const o = JSON.parse(store('turbo3d-bestlap') || '{}'); return +(o[track.id] || 0); } catch (e) { return 0; }
}
function saveBestLap(sec) {
  try {
    const o = JSON.parse(store('turbo3d-bestlap') || '{}');
    if (!o[track.id] || sec < o[track.id]) { o[track.id] = sec; store('turbo3d-bestlap', JSON.stringify(o)); }
  } catch (e) {}
}

// ── 换赛道：旧赛道 group 释放 → 重建曲线/路面 → 重建金币 → NPC 重抽 ──
function switchTrack(id) {
  if (!TRACK_SHAPES[id] || id === track.id) return false;
  stage.scene.remove(track.group);
  disposeTree(track.group);
  coins.dispose();
  track = buildTrack(stage.scene, id);
  coins = createCoins(stage.scene, track);
  START_T = startT();
  applyTrackTint();        // 新赛道也要按当前环境压暗
  respawnNpcs();
  player.t = START_T; player.lastT = START_T; player.lateral = 0; player.speed = 0;
  store('turbo3d-track', id);
  renderTrackRow();
  hud.setMsg(track.name + ' · ' + (TRACK_SHAPES[id].desc || ''), 2.2);
  hud.update(player, 0);
  return true;
}
function refreshEnvIntensity() {
  const v = stage.getEnvIntensity();
  applyEnvIntensity(playerCar, v);
  for (const n of npcs) applyEnvIntensity(n.mesh, v);
}
spawnNpcs();

const input = createInput({
  onCamera: () => { camMode = (camMode + 1) % CAMERA.modes.length; hud.setMsg(CAMERA.modes[camMode].name, 0.7); if (window.__syncSettings) window.__syncSettings(); },
  onRestart: () => restart(),
  onStart: () => { if (!running) startRace(); },
  onNitro: () => tryNitro(),
});
// 手机氮气大钮：单手拇指按一下就放
{
  const nb = document.getElementById('nitroBtn3d');
  if (nb) {
    const fire = (ev) => { ev.preventDefault(); tryNitro(); };
    nb.addEventListener('pointerdown', fire, { passive: false });
  }
}
hud.bindInvertButtons((v) => { input.setInvert(v); hud.syncInvert(input.state.invert, input.state.unlocked); });
if (!input.state.unlocked) input.setInvert(true);
hud.syncInvert(input.state.invert, input.state.unlocked);

// ── 本局金币结算：赛道拾取 + 完赛奖励（节奏与 2D 对齐：一局 60~130）──
function settleRace() {
  if (!player || player._settled) return 0;
  player._settled = true;
  const lapBonus = player.totalLaps * 4;                                          // 2 圈 → 8
  const driftBonus = Math.min(14, Math.floor((player.driftScore || 0) / 900));    // 最多 14
  const cleanBonus = Math.max(0, 6 - Math.floor((player.smashCount || 0) / 6));   // 最多 6
  const raceBonus = Math.max(20, Math.min(60, 16 + lapBonus + driftBonus + cleanBonus));
  const total = player.coinsEarned + raceBonus;                                   // 拾取 + 奖励
  addCoins(profile, raceBonus);
  bumpStats(profile, 1, Math.round(track.trackLen * player.totalLaps));
  player.coinsRaceBonus = raceBonus;
  player.coinTotal = total;
  player.coinBalance = profile.coins;
  hud.setCoinBalance(profile.coins);
  renderGarage();
  return total;
}

// ── 氮气：点一下消耗 1 格，喷 2 秒 ──
function tryNitro() {
  if (!running || paused || countdown > 0 || player.finished) return false;
  if (player.charge < 1) { hud.setMsg('氮气不足 · 漂移集气', 1.2); return false; }
  player.charge -= 1;
  player.nitroTimer = Math.min(NITRO.time * 2, player.nitroTimer + NITRO.time);
  player.nitroFlash = 0.4;
  shake = Math.max(shake, 0.32);
  audio.nitro();
  hud.setMsg('🔥 氮气释放', 0.9);
  return true;
}

// ── 玩法更新 ──
function update(dt) {
  if (!running || paused) { hud.tickMsg(dt); audio.engineOff(); return; }
  clock += dt;
  if (countdown > 0) {
    const before = Math.ceil(countdown);
    countdown -= dt;
    if (Math.ceil(countdown) !== before) audio.beep(before === 1);
    hud.setMsg(String(Math.max(1, before)), 0.5);
    if (countdown <= 0) { hud.setMsg('GO!', 0.8); raceClock = 0; lapStartClock = 0; audio.beep(true); }
    audio.engine(0, false);
    hud.tickMsg(dt);
    return;
  }
  raceClock += dt;
  player.speed += CAR.accel * dt;
  if (input.keys.brake) player.speed -= CAR.brakeDecel * dt;
  else if (!input.keys.gas) player.speed -= CAR.coast * dt;
  player.speed = Math.max(CAR.minSpeed, Math.min(CAR.maxSpeed, player.speed));
  // ── 氮气喷射：额外推力 + 抬高极速上限 ──
  if (player.nitroTimer > 0) {
    player.nitroTimer = Math.max(0, player.nitroTimer - dt);
    player.speed = Math.min(CAR.maxSpeed * NITRO.boost, player.speed + CAR.maxSpeed * 0.8 * dt);
  }
  if (player.nitroFlash > 0) player.nitroFlash = Math.max(0, player.nitroFlash - dt);
  const speedCap = (player.nitroTimer > 0 ? CAR.maxSpeed * NITRO.boost : CAR.maxSpeed) * stage.grip();
  player.speed = Math.min(speedCap, player.speed);

  // 智驾时自动打方向；玩家一碰方向键/倾斜手机就临时接管
  const manualSteer = input.steerAxis(dt);
  const steer = (autopilot && Math.abs(manualSteer) < 0.02) ? autoSteer() : manualSteer;
  if (Math.abs(steer) > 0.5 && player.speed > CAR.maxSpeed * 0.5) player.driftScore += dt * 60;
  // ── 集气：漂移是本作唯一的主动操作，气从这里来（和 2D 同一套）──
  if (Math.abs(steer) > 0.5 && player.speed > CAR.maxSpeed * 0.45) {
    player.charge = Math.min(NITRO.segs, player.charge + dt * NITRO.gainDrift);
  }
  const rate = CAR.steerRate * (CAR.steerSpeedGain + Math.abs(player.speed) / CAR.maxSpeed);
  if (player.pushLateral) {
    player.lateral += player.pushLateral * dt * 6;
    player.pushLateral *= Math.pow(0.12, dt);
    if (Math.abs(player.pushLateral) < 0.01) player.pushLateral = 0;
  }
  player.lateral += steer * rate * dt;
  player.lateral -= track.curvatureAt(player.t) * (player.speed / CAR.maxSpeed) * CAR.driftSpeedGain * (1 / stage.grip()) * dt;
  if (Math.abs(player.lateral) > CAR.lateralLimit) {
    player.lateral = Math.max(-CAR.lateralHardLimit, Math.min(CAR.lateralHardLimit, player.lateral));
    player.speed *= Math.pow(CAR.wallSlow, dt * 3);
  }
  player.lateral = Math.max(-CAR.lateralHardLimit, Math.min(CAR.lateralHardLimit, player.lateral));
  player.t += (player.speed * dt) / track.trackLen;
  // 总进度：圈数（从 0 起）+ 圈内位置，和 NPC 用同一套坐标
  player.prog = ((player.lap - 1) + player.t) * track.trackLen;
  if (player.speed > player.topSpeed) player.topSpeed = player.speed;

  const tp = ((player.t % 1) + 1) % 1;
  if (player.lastT > 0.75 && tp < 0.25) {
    // 起步位置在线后 4.5 米，第一次压线只是「出发」，不能算跑完一圈
    if (!player.armed) {
      player.armed = true;
    } else {
      player.lap++;
      const lapTime = raceClock - lapStartClock;
      lapStartClock = raceClock;
      if (!player.bestLap || lapTime < player.bestLap) player.bestLap = lapTime;
      // 赛道纪录：跑完一圈就比一次，破了立刻提示（不做幽灵车，只留数字）
      const prevBest = loadBestLap();
      if (!prevBest || lapTime < prevBest) {
        saveBestLap(lapTime);
        player.isNewRecord = true;
        hud.setMsg('新纪录！' + lapTime.toFixed(2) + 's', 2.2);
        audio.beep(true);
      }
      if (player.lap > player.totalLaps) {
        player.finished = true;
        player.finishTime = raceClock;
        running = false;
        hud.setRunning(false);
        input.unlock();
        settleRace();
        audio.finish();
        audio.engineOff();
        hud.setMsg('完成！' + player.finishTime.toFixed(2) + 's', 4);
        setTimeout(() => {
          player.trackName = track.name;
          player.bestLapEver = loadBestLap();
          hud.syncInvert(input.state.invert, true);
          hud.countdownPanel(player);
        }, 700);
      } else {
        coins.reshuffle();        // 新一圈，金币重新铺出来
        audio.beep(true);
        hud.setMsg('第 ' + (player.lap - 1) + ' 圈 ' + lapTime.toFixed(2) + 's', 1.6);
      }
    }
  }
  player.lastT = tp;

  if (player.hitCooldown > 0) player.hitCooldown -= dt;
  // ── 碰撞：把两车位移分解到「沿赛道」与「垂直赛道」两个轴，按车体椭圆判定。
  //    v9 修了三个手感问题：
  //    ① 矩形判定（along<4.3 && side<1.85）在斜角上是 √2 倍虚胖区，视觉没碰到就掉速
  //       → 改成椭圆 (along/hitAlong)² + (side/hitSide)² < 1
  //    ② 迎面 / 追尾 / 侧擦一律同等削速，蹭一下和迎面对撞一样疼
  //       → 分三档，侧擦只掉一点速并把人推开
  //    ③ 冷却 1.1 秒内直接 continue，能整个穿过车流
  //       → 冷却期仍做横向分离，只不削速
  const pNow = track.posAt(player.t, player.lateral);
  const pPos = pNow.pos, pTan = pNow.tan;
  for (const n of npcs) {
    n.t += (n.speed * dt) / track.trackLen;
    if (n.t > 1) { n.t -= 1; n.laps = (n.laps || 0) + 1; }
    if (n.t < 0) { n.t += 1; n.laps = (n.laps || 0) - 1; }
    // 名次按「总进度」算：圈数 + 圈内位置，和玩家同一把尺子
    n.prog = ((n.laps || 0) + n.t) * track.trackLen;

    const nPos = track.posAt(n.t, n.lateral).pos;
    const dx = nPos.x - pPos.x, dz = nPos.z - pPos.z;
    const along = Math.abs(dx * pTan.x + dz * pTan.z);       // 前后距离
    const side = Math.abs(-dx * pTan.z + dz * pTan.x);       // 左右距离
    const ra = along / RACE.hitAlong, rb = side / RACE.hitSide;
    if (ra * ra + rb * rb >= 1) continue;

    // 分离方向：玩家该往哪边躲（NPC 在右 → 玩家往左 = -1），两车反向弹开
    const sep = n.lateral > player.lateral ? -1 : 1;

    if (player.hitCooldown > 0) {
      // 冷却期只分离不削速：既不会连环掉速，也不会直接穿过整列车
      player.pushLateral = sep * 0.16;
      n.lateral = Math.max(-1.15, Math.min(1.15, n.lateral - sep * 0.04));
      continue;
    }

    const closing = player.speed - n.speed;                  // 接近速度
    const head = n.oncoming || closing > 60;                 // 迎面
    const graze = !head && along < RACE.hitAlong * 0.5;      // 侧面擦碰
    let loss, cool, msg, shk, spark;
    if (head) {
      // 迎面撞：几乎停住，但留 8% 速度，避免「钉在原地」被后面车流反复怼
      loss = Math.min(player.speed * 0.92, Math.abs(closing) * 0.72 + 4);
      cool = RACE.hitCooldown; msg = '迎面撞！'; shk = 0.5; spark = 10;
    } else if (graze) {
      loss = Math.min(player.speed * 0.16, 4 + Math.abs(closing) * 0.1);
      cool = RACE.hitCooldown * 0.3; msg = ''; shk = 0.14; spark = 4;
    } else {
      loss = Math.min(player.speed, Math.abs(closing) * RACE.hitSlow + 3);
      cool = RACE.hitCooldown * 0.65; msg = '碰撞！'; shk = 0.24; spark = 6;
    }
    player.speed = Math.max(0, player.speed - loss);
    n.lateral = Math.max(-1.15, Math.min(1.15, n.lateral - sep * (head ? 0.36 : 0.22)));
    player.pushLateral = sep * (head ? 0.6 : graze ? 0.46 : 0.32);
    player.smashCount++;
    player.hitCooldown = cool;
    if (msg) hud.setMsg(msg, 0.8);
    shake = Math.max(shake, shk);
    audio.hit(Math.min(1, Math.abs(closing) / 85));
    particles.burst(nPos, head ? 0xffd166 : 0xffb066, spark, 2.4);
  }

  // ── 名次：只和同向车比（逆行车是障碍，不是对手）──
  if (!player.finished) {
    let ahead = 0, total = 1;
    for (const n of npcs) {
      if (n.oncoming) continue;
      total++;
      if (n.prog > player.prog) ahead++;
    }
    player.rankTotal = total;
    player.rank = ahead + 1;
    if (!player.bestRank || player.rank < player.bestRank) {
      if (player.bestRank) player.overtakes += player.bestRank - player.rank;
      player.bestRank = player.rank;
    }
  }

  setBrake(playerCar, input.keys.brake || player.speed < 0);
  audio.engine(player.speed, true);

  // ── 拾取金币：直接进钱包（与 2D 共用同一份档案）──
  const got = coins.collect(playerCar.position);
  for (const g of got) {
    player.coinGot += 1;
    player.coinsEarned += FX.coinValue;
    addCoins(profile, FX.coinValue);
    hud.setCoinBalance(profile.coins);
    particles.burst(g.position, FX.coinColors[0], 16, 3.4);
    player.charge = Math.min(NITRO.segs, player.charge + NITRO.gainCoin);
  }
  // 连吃一串金币时不要每枚都闪提示，0.7 秒内只闪一次
  if (got.length) {
    audio.coin();
    const now = clock;
    if (!player._lastCoinMsg || now - player._lastCoinMsg > 0.7) {
      player._lastCoinMsg = now;
      hud.setMsg('+' + (got.length * FX.coinValue) + ' 币', 0.7);
    }
  }
  coins.update(dt, clock, player.t);
  if (player.nitroTimer > 0 && Math.random() < 0.9) {
    // 喷射：车尾蓝色尾迹
    for (let k = 0; k < 2; k++) {
      particles.spawn(
        playerCar.position.x + (Math.random() - 0.5) * 0.9,
        playerCar.position.y + 0.35 + Math.random() * 0.3,
        playerCar.position.z - 1.8,
        (Math.random() - 0.5) * 2.2, 0.6 + Math.random() * 1.6, -6 - Math.random() * 5,
        0.35, 0.78, 1.0, 0.34, 0.45);
    }
  }
  if (player.driftScore > 10 && Math.random() < 0.3) {
    particles.spawn(playerCar.position.x + (Math.random() - 0.5) * 1.5, playerCar.position.y + 0.3,
      playerCar.position.z - 1.4, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2,
      1, 0.72, 0.2, 0.3, 0.4);
  }
  particles.update(dt);
  hud.update(player, raceClock - lapStartClock);
  hud.tickMsg(dt);
}

// ── 姿态与相机 ──
function footPose(dt) {
  const pp = track.posAt(player.t, player.lateral);
  const fwd = pp.tan.clone().normalize();
  if (player.speed < -1) fwd.multiplyScalar(-1); // 倒车时车头转向实际行驶方向
  const pos = pp.pos.clone();
  pos.y += 0.05;
  // 视觉侧倾：左右输入驱动，限幅 ±CAR.maxRoll，不参与物理
  let target = 0;
  if (input.keys.left) target += CAR.maxRoll;
  if (input.keys.right) target -= CAR.maxRoll;
  if (input.state.invert) target = -target;
  roll += (target - roll) * Math.min(1, dt * CAR.rollLerp); // 侧倾目标限幅在 CAR.maxRoll
  const res = poseCar(playerCar, pos, fwd, roll, dt, false);
  if (res.recovered) { player.recovered++; roll = 0; }
  return { pp, pos };
}

function updateCamera(dt, pp) {
  const mode = CAMERA.modes[camMode];
  // 起步镜头：倒计时期间把相机抬高、拉远，让玩家看清车停在起跑格上
  // （正常机位车身会把前方那条起跑线全挡住，只露出车两侧一小截）
  const intro = countdown > 0 ? Math.min(1, countdown / RACE.countdown) : 0;
  const lift = 1 + intro * 0.75;
  const camPos = pp.pos.clone()
    .addScaledVector(pp.tan, -mode.dist * lift)
    .add(new THREE.Vector3(0, mode.height * lift, 0));
  if (shake > 0.01) {
    camPos.x += (Math.random() - 0.5) * shake * 0.8;
    camPos.y += (Math.random() - 0.5) * shake * 0.8;
    shake = Math.max(0, shake - dt * 2.4);
  }
  stage.camera.position.lerp(camPos, camMode === 1 ? 1 : Math.min(1, dt * 7));
  const look = pp.pos.clone().addScaledVector(pp.tan, 8);
  stage.camera.lookAt(look.x, pp.pos.y + (camMode === 1 ? 0.8 : 1.6), look.z);
  stage.camera.fov = CAMERA.fov + Math.min(CAMERA.fovBoost, Math.abs(player.speed) / CAR.maxSpeed * CAMERA.fovBoost);
  stage.camera.updateProjectionMatrix();
}

function poseAndRender(dt, doRender) {
  const { pp, pos } = footPose(dt);
  updateWheels(playerCar, player.speed, dt, input.keys.left ? 1 : (input.keys.right ? -1 : 0));
  for (const n of npcs) {
    const np = track.posAt(n.t, n.lateral);
    np.pos.y += 0.05;
    const dir = n.speed >= 0 ? 1 : -1;
    const nfwd = np.tan.clone().multiplyScalar(n.oncoming ? -dir : dir);
    poseCar(n.mesh, np.pos, nfwd, 0, dt, false);
    updateWheels(n.mesh, n.speed, dt, 0);
  }
  updateCamera(dt, pp);
  stage.followShadow(pos);
  stage.setGroundY(pos.y);
  // 夜赛车灯跟车、雨战雨幕跟车（只在对应环境下有开销）
  stage.syncLights(playerCar.position, playerCar.quaternion);
  stage.updateRain(dt, playerCar.position);
  if (doRender) stage.renderer.render(stage.scene, stage.camera);
}

function startRace() {
  audio.init();          // 必须由用户手势触发，否则移动端 AudioContext 起不来
  Object.assign(player, { t: START_T, lateral: 0, speed: 0, lap: 1, lastT: START_T, armed: false, finished: false, finishTime: 0, smashCount: 0, hitCooldown: 0, driftScore: 0, pushLateral: 0, recovered: 0,
    coinGot: 0, coinsEarned: 0, charge: 0, nitroTimer: 0, nitroFlash: 0, coinsRaceBonus: 0, coinTotal: 0, coinBalance: profile.coins,
    prog: 0, topSpeed: 0, bestLap: 0, rank: 0, bestRank: 0, overtakes: 0, isNewRecord: false });
  player._settled = false;
  // 名次按「圈数 + 圈内位置」重算，否则重开会继承上一局的进度
  for (const n of npcs) { n.laps = 0; n.prog = n.t * track.trackLen; }
  // 倒计时期间 update 会提前 return，名次先按「起步在最后」摆好，跑起来再实时算
  player.rankTotal = npcs.filter((n) => !n.oncoming).length + 1;
  player.bestRank = player.rank = player.rankTotal;
  coins.reset();
  particles.reset();
  hud.setRunning(true);
  hud.setCoinBalance(profile.coins);
  roll = 0;
  running = true;
  paused = false;
  const pp = document.getElementById('pausePanel');
  if (pp) pp.classList.remove('show');
  countdown = RACE.countdown;
  clock = 0;
  hud.hideOverlay();
  hud.showKeyHints();
  hud.update(player, 0);      // 把名次先摆上，倒计时期间 HUD 也要显示 P12/12
  hud.setMsg('3', 0.9);
}
function restart() {
  running = false;
  paused = false;
  hud.setRunning(false);
  player.speed = 0;
  audio.engineOff();
  const pp = document.getElementById('pausePanel');
  if (pp) pp.classList.remove('show');
  hud.restorePanel();      // 结算面板换回首页，否则「R 重开」会回到成绩页
  bindStartBtn();
  hud.update(player, 0);
}

// ── 暂停 / 设置 ──
function setPaused(v) {
  if (!running) return;
  paused = !!v;
  const pp = document.getElementById('pausePanel');
  if (pp) pp.classList.toggle('show', paused);
  const tch = document.getElementById('touch');
  if (tch) tch.style.display = paused ? 'none' : '';
}
function quitToMenu() {
  running = false;
  paused = false;
  hud.setRunning(false);
  player.speed = 0;
  audio.engineOff();
  const pp = document.getElementById('pausePanel');
  if (pp) pp.classList.remove('show');
  hud.restorePanel();
  renderTrackRow();        // 首页面板是 innerHTML 快照恢复的，赛道/环境按钮要重新渲染
  renderEnvRow();
  bindStartBtn();
  hud.syncInvert(input.state.invert, input.state.unlocked);
  hud.update(player, 0);
}
function bindStartBtn() {
  const b = document.getElementById('startBtn');
  if (b) b.addEventListener('click', startRace);
}

// ── 主循环 ──
let lastTs = 0, fpsAcc = 0, fpsN = 0, rafId = 0;
function frame(ts) {
  if (!lastTs) lastTs = ts;
  // 统计用真实间隔，物理用 clamp 后的 dt —— 原来两处都用 clamp 值，
  // 任何低于 20fps 的机器都会恒定显示 20 FPS
  const rawDt = Math.min((ts - lastTs) / 1000, 1);
  const dt = Math.min(rawDt, 0.05);
  lastTs = ts;
  fpsAcc += rawDt;
  fpsN++;
  if (fpsAcc >= 0.5) { hud.setFps(Math.round(fpsN / fpsAcc)); fpsAcc = 0; fpsN = 0; }
  update(dt);
  poseAndRender(paused ? 0 : dt, true);
  rafId = requestAnimationFrame(frame);
}

bindStartBtn();
hud.setOnAgain(() => startRace());   // 结算页「再来一局」原地重开，不整页刷新
hud.setOnMenu(() => quitToMenu());   // 结算页「回到车库」
{
  const pb = document.getElementById('pauseBtn');
  if (pb) pb.addEventListener('click', () => setPaused(!paused));
  const pr = document.getElementById('pauseResume');
  if (pr) pr.addEventListener('click', () => setPaused(false));
  const pst = document.getElementById('pauseRestart');
  if (pst) pst.addEventListener('click', () => { setPaused(false); startRace(); });
  const pq = document.getElementById('pauseQuit');
  if (pq) pq.addEventListener('click', quitToMenu);

  // 智驾开关：HUD 上那个「智驾 / 手动」，点一下切换（第一次点会提示）
  const ab = document.getElementById('autoBtn3d');
  if (ab) ab.addEventListener('click', () => setAutopilot(!autopilot));
  setAutopilot(autopilot, true);

  // 设置区：音效 / 主题 / 陀螺仪 / 视角（和 2D 共用同一个主题键）
  const sb = document.getElementById('soundBtn3d');
  const tb = document.getElementById('themeBtn3d');
  const gb = document.getElementById('gyroBtn3d');
  const cb = document.getElementById('camBtn3d');
  const syncSettings = () => {
    if (sb) { sb.textContent = audio.isOn() ? '🔊 音效' : '🔇 静音'; sb.className = 'setMini ' + (audio.isOn() ? 'on' : 'off'); }
    if (tb) { const cur = THEME[stage.theme.name]; tb.textContent = (ENV_ICON[stage.theme.name] || '🌗') + ' ' + ((cur && cur.label) || '黄昏'); }
    if (gb) { gb.textContent = '📱 陀螺仪'; gb.className = 'setMini ' + (input.state.gyro.enabled ? 'on' : 'off'); }
    if (cb) cb.textContent = '🎥 ' + CAMERA.modes[camMode].name;
  };
  if (sb) sb.addEventListener('click', () => { audio.setOn(!audio.isOn()); syncSettings(); audio.click(); });
  if (tb) tb.addEventListener('click', () => {
    // 四档循环：黄昏 → 白天 → 夜赛 → 雨战（首页也有同样的按钮行）
    const i = ENV_ORDER.indexOf(stage.theme.name);
    setEnv(ENV_ORDER[(i + 1) % ENV_ORDER.length]);
    syncSettings();
  });
  if (gb) gb.addEventListener('click', () => {
    const g = input.state.gyro;
    g.enabled = !g.enabled;
    store(KEYS.gyro, g.enabled ? '1' : '0');
    if (g.enabled) input.armGyro(); else { g.steer = 0; g.raw = 0; g.base = null; }
    syncSettings();
  });
  if (cb) cb.addEventListener('click', () => {
    camMode = (camMode + 1) % CAMERA.modes.length;
    hud.setMsg(CAMERA.modes[camMode].name, 0.7);
    syncSettings();
  });
  syncSettings();
  window.__syncSettings = syncSettings;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { setPaused(!paused); e.preventDefault(); }
    else if (e.code === 'KeyT') { setAutopilot(!autopilot); e.preventDefault(); }
  });
}
hud.applyLock(); hud.update(player, 0);
hud.showOverlay();   // 启动时首页是开着的：顺手把底部触摸键收起（showOverlay 内部同步）
rafId = requestAnimationFrame(frame);
// 停止主循环（无头验证用，避免 rAF 空转把虚拟时间耗尽）
function pauseLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  stage.renderer.render(stage.scene, stage.camera);
}

// ── 自动化验证接口（selftest.js 与控制台调试共用，不影响正常玩法）──
window.__THREE_REVISION = THREE.REVISION;
window.__TURBO = {
  ready: true,
  stage, player, playerCar, npcs, input, hud, particles, profile,
  // track / coins 换赛道时会被整体替换，必须用 getter，否则拿到的还是旧对象
  get track() { return track; },
  get coins() { return coins; },
  switchTrack(id) { return switchTrack(id); },
  setEnv(id) { return setEnv(id); },
  env() { return stage.theme.name; },
  bestLap() { return loadBestLap(); },
  addCoins(n) { const v = addCoins(profile, n); hud.setCoinBalance(profile.coins); renderGarage(); return v; },
  nitroFull() { player.charge = NITRO.segs; return player.charge; },
  nitro() { player.charge = NITRO.segs; return tryNitro(); },
  auto(on) { setAutopilot(on === undefined ? !autopilot : on, true); return autopilot; },
  autoState() { return autopilot; },
  start(opts) {
    startRace();
    if (opts && opts.skipCountdown) countdown = 0;
    poseAndRender(1 / 60, false);
    return true;
  },
  stop() { running = false; },
  pause() { pauseLoop(); },
  step(n, dt) {
    const h = dt || 1 / 60;
    for (let i = 0; i < n; i++) { update(h); poseAndRender(h, true); }
    return this.telemetry();
  },
  telemetry() {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(playerCar.quaternion);
    const hd = headingOf(playerCar);
    const fwd = track.posAt(player.t, player.lateral).tan.clone().normalize();
    return {
      upY: +up.y.toFixed(4), headingDot: +hd.dot(fwd).toFixed(4),
      t: +player.t.toFixed(4), lateral: +player.lateral.toFixed(3), speed: +player.speed.toFixed(2),
      lap: player.lap, running, countdown: +Math.max(0, countdown).toFixed(2),
      recoveries: player.recovered, roll: +roll.toFixed(4),
      coinGot: player.coinGot, coinsEarned: player.coinsEarned,
      charge: +player.charge.toFixed(2), nitroTimer: +player.nitroTimer.toFixed(2),
      coinsBalance: profile.coins,
      autopilot,
      drawCalls: stage.renderer.info.render.calls, triangles: stage.renderer.info.render.triangles,
    };
  },
  // 故意把车打翻，验证复位逻辑：axis='x' 前后翻 / 'z' 侧翻
  flipTest(axis) {
    const ax = axis || 'z';
    const e = ax === 'z' ? new THREE.Euler(0, 0, Math.PI)
      : ax === 'y' ? new THREE.Euler(0, Math.PI, 0) : new THREE.Euler(Math.PI, 0, 0);
    playerCar.quaternion.setFromEuler(e);
    const before = +new THREE.Vector3(0, 1, 0).applyQuaternion(playerCar.quaternion).y.toFixed(3);
    const rec0 = player.recovered;
    const t = this.step(1);
    return { axis: ax, before, after: t.upY, recovered: player.recovered > rec0 };
  },
  // 调试标记：车头方向放品红球（+Z），车尾放黄球（-Z），用于确认朝向
  markers(on) {
    const old = [playerCar.getObjectByName('noseMarker'), playerCar.getObjectByName('tailMarker')];
    old.forEach((m) => { if (m) playerCar.remove(m); });
    if (!on) return false;
    const mk = (name, color, z) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshBasicMaterial({ color }));
      m.name = name;
      m.position.set(0, 1.5, z);
      playerCar.add(m);
    };
    mk('noseMarker', 0xff00ff, 3.1);
    mk('tailMarker', 0xffe600, -3.1);
    return true;
  },
  // 车模自检：各材质零件在车体局部坐标里的位置（用于确认车头朝向 +Z、灯组位置正确）
  modelAudit() {
    const shell = playerCar.children.find((c) => c.isGroup);
    const rows = [];
    shell.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      rows.push({
        color: o.material.color ? o.material.color.getHexString() : null,
        z: [+b.min.z.toFixed(2), +b.max.z.toFixed(2)],
        y: [+b.min.y.toFixed(2), +b.max.y.toFixed(2)],
        x: [+b.min.x.toFixed(2), +b.max.x.toFixed(2)],
      });
    });
    const mats = car => void car;
    void mats;
    return {
      noseAxis: 'local +Z',
      parts: rows,
      mats: Object.keys(playerCar.userData.mats).map((k) => k + '#' + (playerCar.userData.mats[k].color ? playerCar.userData.mats[k].color.getHexString() : '-')),
    };
  },
  theme(name) {
    stage.applyTheme(name);
    refreshEnvIntensity();
    return stage.theme.name;
  },
};
