// ─────────────────────────────────────────────────────────────
// main.js · 装配与主循环（状态机 / 圈数 / NPC / 碰撞 / 相机 / 测试接口）
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CAR, RACE, NPC, CAMERA, FX } from './config.js';
import { createStage } from './scene.js';
import { buildTrack } from './track.js';
import { buildCar, poseCar, headingOf, updateWheels, applyEnvIntensity, setBrake } from './car.js';
import { createInput } from './input.js';
import { createParticles, createSkillItems, createShield } from './fx.js';
import { createSkills } from './skills.js';
import { createHud } from './hud.js';

const canvas = document.getElementById('game');
const stage = createStage(canvas);
const track = buildTrack(stage.scene);
const hud = createHud();
const particles = createParticles(stage.scene);
const skillItems = createSkillItems(stage.scene, track);
const shieldFx = createShield(stage.scene);
const skills = createSkills((text, dur) => hud.setMsg(text, dur));
// 技能按钮：真正绑事件（原来只有 HTML 内联 onclick，指向不存在的函数）
hud.bindSkillButtons(skills, (type) => {
  const def = FX.skillDefs[type];
  if (def) particles.burst(playerCar.position, def.color, 25, 4);
});
const playerCar = buildCar(0x00ffcc, 'high');
stage.scene.add(playerCar);
const npcs = [];

const player = {
  t: 0, lateral: 0.15, speed: 0, lap: 1, totalLaps: RACE.laps, lastT: 0,
  finished: false, finishTime: 0, smashCount: 0, hitCooldown: 0,
  driftScore: 0, pushLateral: 0, skills: skills.s, recovered: 0,
};
let running = false, camMode = 0, clock = 0, countdown = 0, raceClock = 0, lapStartClock = 0, shake = 0, roll = 0;
let paused = false;

function spawnNpcs() {
  for (let i = 0; i < NPC.count; i++) {
    const car = buildCar(NPC.colors[i % NPC.colors.length], 'low');
    const oncoming = i % NPC.oncomingEvery === 0;
    const npc = {
      mesh: car,
      t: Math.random(),
      lateral: (Math.random() - 0.5) * 1.4,
      speed: oncoming ? -(NPC.oncomingMin + Math.random() * NPC.oncomingRange) : NPC.speedMin + Math.random() * NPC.speedRange,
      oncoming,
    };
    stage.scene.add(car);
    npcs.push(npc);
  }
  refreshEnvIntensity();
}
function refreshEnvIntensity() {
  const v = stage.getEnvIntensity();
  applyEnvIntensity(playerCar, v);
  for (const n of npcs) applyEnvIntensity(n.mesh, v);
}
spawnNpcs();

const input = createInput({
  onCamera: () => { camMode = (camMode + 1) % CAMERA.modes.length; hud.setMsg(CAMERA.modes[camMode].name, 0.7); },
  onRestart: () => restart(),
  onStart: () => { if (!running) startRace(); },
});
hud.bindInvertButtons((v) => { input.setInvert(v); hud.syncInvert(input.state.invert, input.state.unlocked); });
if (!input.state.unlocked) input.setInvert(true);
hud.syncInvert(input.state.invert, input.state.unlocked);

// ── 玩法更新 ──
function update(dt) {
  if (!running || paused) { hud.tickMsg(dt); return; }
  clock += dt;
  if (countdown > 0) {
    const before = Math.ceil(countdown);
    countdown -= dt;
    hud.setMsg(String(Math.max(1, before)), 0.5);
    if (countdown <= 0) { hud.setMsg('GO!', 0.8); raceClock = 0; lapStartClock = 0; }
    hud.tickMsg(dt);
    return;
  }
  raceClock += dt;
  player.speed += CAR.accel * dt;
  if (input.keys.brake) player.speed -= CAR.brakeDecel * dt;
  else if (!input.keys.gas) player.speed -= CAR.coast * dt;
  player.speed = Math.max(CAR.minSpeed, Math.min(CAR.maxSpeed, player.speed));
  player.speed = skills.boost(player.speed, CAR.maxSpeed, dt);

  const steer = input.steerAxis(dt);
  if (Math.abs(steer) > 0.5 && player.speed > CAR.maxSpeed * 0.5) player.driftScore += dt * 60;
  const rate = CAR.steerRate * (CAR.steerSpeedGain + Math.abs(player.speed) / CAR.maxSpeed);
  if (player.pushLateral) {
    player.lateral += player.pushLateral * dt * 6;
    player.pushLateral *= Math.pow(0.12, dt);
    if (Math.abs(player.pushLateral) < 0.01) player.pushLateral = 0;
  }
  player.lateral += steer * rate * dt;
  player.lateral -= track.curvatureAt(player.t) * (player.speed / CAR.maxSpeed) * CAR.driftSpeedGain * dt;
  if (Math.abs(player.lateral) > CAR.lateralLimit) {
    player.lateral = Math.max(-CAR.lateralHardLimit, Math.min(CAR.lateralHardLimit, player.lateral));
    player.speed *= Math.pow(CAR.wallSlow, dt * 3);
  }
  player.lateral = Math.max(-CAR.lateralHardLimit, Math.min(CAR.lateralHardLimit, player.lateral));
  player.t += (player.speed * dt) / track.trackLen;

  const tp = ((player.t % 1) + 1) % 1;
  if (player.lastT > 0.75 && tp < 0.25) {
    player.lap++;
    const lapTime = raceClock - lapStartClock;
    lapStartClock = raceClock;
    if (player.lap > player.totalLaps) {
      player.finished = true;
      player.finishTime = raceClock;
      running = false;
      input.unlock();
      hud.setMsg('完成！' + player.finishTime.toFixed(2) + 's', 4);
      setTimeout(() => { hud.syncInvert(input.state.invert, true); hud.countdownPanel(player); }, 700);
    } else {
      hud.setMsg('第 ' + (player.lap - 1) + ' 圈 ' + lapTime.toFixed(2) + 's', 1.6);
    }
  }
  player.lastT = tp;

  if (player.hitCooldown > 0) player.hitCooldown -= dt;
  for (const n of npcs) {
    n.t += (n.speed * dt) / track.trackLen;
    if (n.t > 1) n.t -= 1;
    if (n.t < 0) n.t += 1;
    const dtl = Math.abs(((n.t - player.t + 0.5 + 1) % 1) - 0.5);
    if (player.hitCooldown <= 0 && dtl < RACE.hitDistance && Math.abs(n.lateral - player.lateral) < RACE.hitLateral) {
      player.speed = Math.max(0, player.speed - RACE.hitSlow);
      const dir = n.lateral > player.lateral ? -1 : 1;
      n.lateral += dir * 0.25;
      player.pushLateral = dir * 0.35;
      player.smashCount++;
      player.hitCooldown = RACE.hitCooldown;
      hud.setMsg('碰撞！', 0.8);
      shake = Math.max(shake, 0.25);
    }
  }

  setBrake(playerCar, input.keys.brake || player.speed < 0);

  const got = skillItems.collect(playerCar.position);
  for (const g of got) {
    skills.add(10);
    hud.setMsg('⭐ +10 技能点', 1);
    particles.burst(g.position, FX.skillColors[g.type], 15, 5);
  }
  skillItems.update(dt, clock, playerCar.position, skills.s.magnetRange);
  skills.update(dt);
  shieldFx.update(dt, clock, skills.s.shield, playerCar.position);
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
  const camPos = pp.pos.clone()
    .addScaledVector(pp.tan, -mode.dist)
    .add(new THREE.Vector3(0, mode.height, 0));
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
  if (doRender) stage.renderer.render(stage.scene, stage.camera);
}

function startRace() {
  Object.assign(player, { t: 0, lateral: 0.15, speed: 0, lap: 1, lastT: 0, finished: false, finishTime: 0, smashCount: 0, hitCooldown: 0, driftScore: 0, pushLateral: 0, recovered: 0 });
  skills.reset();
  skillItems.reset();
  particles.reset();
  roll = 0;
  running = true;
  paused = false;
  const pp = document.getElementById('pausePanel');
  if (pp) pp.classList.remove('show');
  countdown = RACE.countdown;
  clock = 0;
  hud.hideOverlay();
  hud.showKeyHints();
  hud.setMsg('3', 0.9);
}
function restart() {
  running = false;
  paused = false;
  player.speed = 0;
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
}
function quitToMenu() {
  running = false;
  paused = false;
  player.speed = 0;
  const pp = document.getElementById('pausePanel');
  if (pp) pp.classList.remove('show');
  hud.restorePanel();
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
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc >= 0.5) { hud.setFps(Math.round(fpsN / fpsAcc)); fpsAcc = 0; fpsN = 0; }
  update(dt);
  poseAndRender(paused ? 0 : dt, true);
  rafId = requestAnimationFrame(frame);
}

bindStartBtn();
hud.setOnAgain(() => startRace());   // 结算页「再来一局」原地重开，不整页刷新
{
  const pb = document.getElementById('pauseBtn');
  if (pb) pb.addEventListener('click', () => setPaused(!paused));
  const pr = document.getElementById('pauseResume');
  if (pr) pr.addEventListener('click', () => setPaused(false));
  const pst = document.getElementById('pauseRestart');
  if (pst) pst.addEventListener('click', () => { setPaused(false); startRace(); });
  const pq = document.getElementById('pauseQuit');
  if (pq) pq.addEventListener('click', quitToMenu);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { setPaused(!paused); e.preventDefault(); }
  });
}
hud.applyLock(); hud.update(player, 0);
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
  stage, track, player, playerCar, npcs, skills, input, hud, particles,
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
