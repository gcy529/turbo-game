// ─────────────────────────────────────────────────────────────
// skills.js · 技能系统（护盾 / 磁力 / 缓时 / 氮气）
// 只管理状态与数值，视觉交给 fx.js 与 car.js
// ─────────────────────────────────────────────────────────────
import { FX } from './config.js';

export function createSkills(onMessage) {
  const s = {
    points: 0,
    active: null,
    timer: 0,
    glow: 0,
    shield: false,
    magnetRange: 0,
    timeSlow: 1,
    lastEnded: null,
  };

  function defs() { return FX.skillDefs; }

  function activate(type, world) {
    const def = FX.skillDefs[type];
    if (!def) return { ok: false, reason: 'unknown' };
    if (s.points < def.cost) { onMessage('💫 技能点不足！', 1); return { ok: false, reason: 'points' }; }
    if (s.active) { onMessage('⚡ 已有激活技能！', 1); return { ok: false, reason: 'busy' }; }
    s.points -= def.cost;
    s.active = type;
    s.timer = def.duration;
    s.glow = 1;
    onMessage(def.icon + ' ' + def.name + ' 激活！', 1.2);
    if (world && world.burst) world.burst(world.position, def.color, 25, 4);
    return { ok: true };
  }

  function add(points) { s.points += points; s.glow = 0.5; }

  function update(dt) {
    if (s.glow > 0) s.glow -= dt;
    if (!s.active) {
      s.shield = false; s.magnetRange = 0; s.timeSlow = 1;
      return { ended: null };
    }
    s.timer -= dt;
    s.shield = s.active === 'shield';
    s.magnetRange = s.active === 'magnet' ? 5 : 0;
    s.timeSlow = s.active === 'slow' ? 0.4 : 1;
    let ended = null;
    if (s.timer <= 0) {
      ended = s.active;
      s.active = null; s.timer = 0;
      s.shield = false; s.magnetRange = 0; s.timeSlow = 1;
      onMessage('⚡ 技能结束', 0.8);
    }
    return { ended };
  }

  function boost(speed, maxSpeed, dt) {
    if (s.active !== 'megaboost') return speed;
    return Math.min(maxSpeed * 1.3, speed + 20 * dt);
  }

  function reset() {
    s.points = 0; s.active = null; s.timer = 0; s.glow = 0;
    s.shield = false; s.magnetRange = 0; s.timeSlow = 1;
  }

  return { s, defs, activate, add, update, boost, reset };
}
