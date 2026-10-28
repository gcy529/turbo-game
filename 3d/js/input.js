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
  let nitroHeld = false;   // Shift/N 长按只触发一次
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
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyN') {
      // 氮气：点一下放一格（长按不连发，抬手还能再点）
      if (!nitroHeld) { nitroHeld = true; hooks.onNitro && hooks.onNitro(); }
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    const act = KEYMAP[e.code];
    if (act) { keys[act] = false; e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyN') nitroHeld = false;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // ── 掐掉手机浏览器的「长按手势」──
  // 手机自带浏览器长按 500ms 会抢走触摸：安卓弹「复制 / 保存图片」，
  // iOS 进选择模式并显示放大镜。被抢的那一刻浏览器会补发 pointercancel，
  // 于是按键当场松开 —— 表现就是「一直按着，车却一顿一顿 / 根本跑不起来」。
  // CSS 侧已经用 user-select:none + -webkit-touch-callout:none 压了一轮，
  // 这几类事件再兜一层：不同内核（尤其国产自带浏览器）吃的不一样。
  function blockNativeGesture(el) {
    if (!el) return;
    const block = (e) => { e.preventDefault(); };
    ['contextmenu', 'selectstart', 'dragstart', 'gesturestart'].forEach((name) => {
      el.addEventListener(name, block, { passive: false });
    });
  }

  function bindTouch(id, act) {
    const el = document.getElementById(id);
    if (!el) return;
    blockNativeGesture(el);
    const set = (v) => (ev) => { keys[act] = v; ev.preventDefault(); };
    if (window.PointerEvent) {
      el.addEventListener('pointerdown', (ev) => {
        keys[act] = true;
        ev.preventDefault();
        // 抓住这根手指：手指按住后轻微滑动（拇指很难完全不抖）
        // 不会再因为滑出圆盘而判定松开，长按途中也不会被系统半途改判。
        try { el.setPointerCapture(ev.pointerId); } catch (err) { /* 老内核不支持就算了 */ }
      }, { passive: false });
      el.addEventListener('pointerup', set(false), { passive: false });
      el.addEventListener('pointercancel', set(false), { passive: false });
      // capture 之后 pointerleave 不会再来，用 lostpointercapture 兜底防「卡键」
      el.addEventListener('lostpointercapture', set(false), { passive: false });
      el.addEventListener('pointerleave', (ev) => {
        // 没有 capture 的内核仍按「滑出即松」处理；有 capture 时这条不会触发
        if (!el.hasPointerCapture || !el.hasPointerCapture(ev.pointerId)) set(false)(ev);
      }, { passive: false });
    } else {
      el.addEventListener('touchstart', set(true), { passive: false });
      el.addEventListener('touchend', set(false), { passive: false });
      el.addEventListener('touchcancel', set(false), { passive: false });
      el.addEventListener('mousedown', set(true), { passive: false });
      el.addEventListener('mouseup', set(false), { passive: false });
    }
  }
  bindTouch('tl', 'left');
  bindTouch('tr', 'right');
  bindTouch('tg', 'gas');

  // 画布与整页也一起锁：长按赛道会弹「保存图片」，长按 HUD 会选中数字
  blockNativeGesture(document.getElementById('touch'));
  blockNativeGesture(document.getElementById('game'));
  blockNativeGesture(document.getElementById('hud'));
  blockNativeGesture(document.body);

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
