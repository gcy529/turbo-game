// ─────────────────────────────────────────────────────────────
// audio.js · 纯 WebAudio 合成音效（零外部资源，断网也能响）
// 引擎声跟着车速走，金币/氮气/碰撞/倒计时各一声，音量一个总闸。
// ─────────────────────────────────────────────────────────────
import { store } from './config.js';

const KEY = 'turbo3d-sound';

export function createAudio() {
  let AC = null, master = null, eng = null, engGain = null, engFilter = null, sub = null;
  let on = store(KEY) !== '0';
  let inited = false;

  function init() {
    if (inited) { if (AC && AC.state === 'suspended') AC.resume().catch(() => {}); return; }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    inited = true;
    try {
      AC = new Ctor();
      master = AC.createGain();
      master.gain.value = on ? 0.5 : 0;
      master.connect(AC.destination);

      // 引擎：锯齿 + 方波低八度，过低通，听起来像电机高频啸叫 + 低频轰鸣
      eng = AC.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 90;
      sub = AC.createOscillator(); sub.type = 'square'; sub.frequency.value = 45;
      engFilter = AC.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 900; engFilter.Q.value = 6;
      engGain = AC.createGain(); engGain.gain.value = 0;
      eng.connect(engFilter); sub.connect(engFilter);
      engFilter.connect(engGain); engGain.connect(master);
      eng.start(); sub.start();
    } catch (e) { AC = null; }
  }

  function ensure() { if (!AC) init(); if (AC && AC.state === 'suspended') AC.resume().catch(() => {}); return !!AC; }

  function setOn(v) {
    on = !!v;
    store(KEY, on ? '1' : '0');
    if (master && AC) master.gain.setTargetAtTime(on ? 0.5 : 0, AC.currentTime, 0.05);
    return on;
  }

  /** 车速驱动引擎音：0..96 → 90..520Hz，音量随速度略升 */
  function engine(speed, active) {
    if (!AC || !engGain) return;
    const v = Math.min(1, Math.abs(speed) / 96);
    const f = 90 + v * 430 + (Math.abs(speed) % 7) * 1.4;   // 轻微抖动，别像纯音
    const now = AC.currentTime;
    eng.frequency.setTargetAtTime(f, now, 0.08);
    sub.frequency.setTargetAtTime(f * 0.5, now, 0.08);
    engFilter.frequency.setTargetAtTime(500 + v * 2200, now, 0.1);
    engGain.gain.setTargetAtTime(active ? (0.05 + v * 0.16) : 0, now, 0.12);
  }
  function engineOff() { if (engGain && AC) engGain.gain.setTargetAtTime(0, AC.currentTime, 0.1); }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, AC.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), AC.currentTime + dur);
    g.gain.setValueAtTime(0.0001, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, AC.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(AC.currentTime + dur + 0.02);
  }

  function coin() { blip(1180, 0.1, 'triangle', 0.22, 1760); setTimeout(() => blip(1560, 0.09, 'triangle', 0.16, 2100), 55); }
  function nitro() {
    blip(180, 0.45, 'sawtooth', 0.28, 760);
    setTimeout(() => blip(420, 0.32, 'square', 0.12, 1200), 90);
  }
  function hit(power) {
    if (!ensure()) return;
    const p = Math.max(0.25, Math.min(1, power || 0.6));
    // 低频冲击 + 噪声
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(140, AC.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, AC.currentTime + 0.22);
    g.gain.setValueAtTime(0.35 * p, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.24);
    o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + 0.26);

    const len = Math.floor(AC.sampleRate * 0.16);
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = AC.createBufferSource(), ng = AC.createGain();
    src.buffer = buf; ng.gain.value = 0.3 * p;
    src.connect(ng); ng.connect(master); src.start();
  }
  function beep(last) { blip(last ? 880 : 520, last ? 0.36 : 0.14, 'square', 0.2); }
  function finish() {
    [660, 880, 1320].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.24), i * 110));
  }
  function click() { blip(720, 0.06, 'square', 0.1); }

  return { init, ensure, setOn, isOn: () => on, engine, engineOff, coin, nitro, hit, beep, finish, click };
}
