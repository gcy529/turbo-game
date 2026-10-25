// ─────────────────────────────────────────────────────────────
// input.js · 键盘 / 触屏 / 陀螺仪输入 + 逆反模式（A/B）状态
// ─────────────────────────────────────────────────────────────
import { KEYS, store } from './config.js';

const KEYMAP = {
  KeyW: 'gas', ArrowUp: 'gas',
  KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function createInput(hooks = {}) {
  const keys = { gas: false, brake: false, left: false, right: false };
  const state = {
    invert: true,          // 逆反模式：默认开（本版特色）
    unlocked: false,       // 跑完一局才解锁反转开关
    gyro: { enabled: false, steer: 0, raw: 0, base: null, armed: false },
  };

  const savedInv = store(KEYS.invert);
  if (savedInv === '0' || savedInv === '1') state.invert = savedInv === '1';
  state.unlocked = store(KEYS.unlocked) === '1';
  state.gyro.enabled = store(KEYS.gyro) === '1';

  function onKeyDown(e) {
    const act = KEYMAP[e.code];
    if (act) { keys[act] = true; e.preventDefault(); return; }
    if (e.code === 'KeyC') { hooks.onCamera && hooks.onCamera(); e.preventDefault(); }
    else if (e.code === 'KeyR') { hooks.onRestart && hooks.onRestart(); e.preventDefault(); }
    else if (e.code === 'Space') { hooks.onStart && hooks.onStart(); e.preventDefault(); }
  }
  function onKeyUp(e) {
    const act = KEYMAP[e.code];
    if (act) { keys[act] = false; e.preventDefault(); }
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function bindTouch(id, act) {
    const el = document.getElementById(id);
    if (!el) return;
    const set = (v) => (ev) => { keys[act] = v; ev.preventDefault(); };
    if (window.PointerEvent) {
      el.addEventListener('pointerdown', set(true), { passive: false });
      el.addEventListener('pointerup', set(false), { passive: false });
      el.addEventListener('pointercancel', set(false), { passive: false });
      el.addEventListener('pointerleave', set(false), { passive: false });
    } else {
      el.addEventListener('touchstart', set(true), { passive: false });
      el.addEventListener('touchend', set(false), { passive: false });
      el.addEventListener('mousedown', set(true), { passive: false });
      el.addEventListener('mouseup', set(false), { passive: false });
    }
  }
  bindTouch('tl', 'left');
  bindTouch('tr', 'right');
  bindTouch('tg', 'gas');

  // ── 陀螺仪倾斜转向（与 2D 版同逻辑）──
  function gyroAxis(e) {
    let landscape = false;
    try { landscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches; } catch (err) { landscape = false; }
    if (landscape) return e.beta !== null ? e.beta : 0;
    return e.gamma !== null ? e.gamma : 0;
  }
  function onGyro(e) {
    if (e.gamma === null && e.beta === null) return;
    const v = gyroAxis(e);
    if (state.gyro.base === null) state.gyro.base = v;
    state.gyro.raw = v - state.gyro.base;
  }
  function armGyro() {
    if (typeof window.DeviceOrientationEvent === 'undefined') return;
    const g = state.gyro;
    g.armed = true; g.base = null; g.raw = 0; g.steer = 0;
    window.addEventListener('deviceorientation', onGyro, true);
    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      window.DeviceOrientationEvent.requestPermission()
        .then((res) => { g.armed = res === 'granted'; })
        .catch(() => { g.armed = false; });
    }
  }
  if (state.gyro.enabled) armGyro();

  function gyroSteer(dt) {
    const g = state.gyro;
    if (!g.enabled || !g.armed) { g.steer *= Math.max(0, 1 - dt * 8); return 0; }
    g.steer += (g.raw - g.steer) * Math.min(1, dt * 9);
    if (Math.abs(g.steer) < 0.04) g.steer = 0;
    const v = Math.max(-1, Math.min(1, g.steer / 28));
    if (Math.abs(v) > 0.35) return v > 0 ? 1 : -1;
    return Math.abs(v) > 0.05 ? v * 0.8 : 0;
  }

  /** 键盘优先；未按键时用陀螺仪；最后按逆反模式取反 */
  function steerAxis(dt) {
    let steer = 0;
    if (keys.left) steer -= 1;
    if (keys.right) steer += 1;
    if (!keys.left && !keys.right) steer = gyroSteer(dt);
    if (state.invert) steer = -steer;
    return steer;
  }

  function setInvert(v) {
    state.invert = !!v;
    store(KEYS.invert, state.invert ? '1' : '0');
    return state.invert;
  }
  function unlock() {
    if (state.unlocked) return false;
    state.unlocked = true;
    store(KEYS.unlocked, '1');
    return true;
  }

  return { keys, state, steerAxis, setInvert, unlock, armGyro, dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  } };
}
