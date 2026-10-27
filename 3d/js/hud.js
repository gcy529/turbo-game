// ─────────────────────────────────────────────────────────────
// hud.js · HUD 与所有 DOM 界面（速度/圈数/分数/金币/氮气/结算面板/逆反开关）
// ─────────────────────────────────────────────────────────────
import { RACE, KEYS, store } from './config.js';

export function createHud() {
  const el = {
    spd: document.getElementById('spd'),
    lap: document.getElementById('lap'),
    lapTotal: document.getElementById('lapTotal3d'),
    t1: document.getElementById('t1'),
    score: document.getElementById('score3d'),
    who: document.getElementById('who3d'),
    msg: document.getElementById('msg'),
    fps: document.getElementById('fpsBox'),
    overlay: document.getElementById('overlay'),
    panel: document.querySelector('#overlay .panel'),   // 必须是 overlay 里的面板（暂停面板也有 .panel）
    coinHud: document.getElementById('coinHud3d'),
    coinGot: document.getElementById('coinGot3d'),
    nitro: document.getElementById('nitro3d'),
    nitroBar: document.getElementById('nitroBar3d'),
    nitroHint: document.getElementById('nitroHint3d'),
    startBtn: document.getElementById('startBtn'),
    keyHints: document.getElementById('keyHints'),
    d3lock: document.getElementById('d3lock'),
    d3cd: document.getElementById('d3cd'),
    d3tag: document.getElementById('d3tag'),
  };

  let msgTimer = 0;
  let running = false;   // 由 main.js 通过 setRunning 同步，用于显隐金币 HUD
  let onAgain = null;                       // 结算页「再来一局」回调（由 main.js 注入）
  const panelHome = el.panel ? el.panel.innerHTML : '';   // 首页面板原始 HTML
  function setMsg(text, dur) {
    if (!el.msg) return;
    el.msg.textContent = text;
    el.msg.style.opacity = '1';
    msgTimer = dur || 1;
  }
  function tickMsg(dt) {
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0 && el.msg) el.msg.style.opacity = '0';
    }
  }

  // 逆行提示条（原版行为：倒车够快时出现）
  let revEl = null;
  function ensureRevEl() {
    if (revEl) return revEl;
    const d = document.createElement('div');
    d.id = 'revDrive';
    d.textContent = '← 你跑反了';
    d.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:11;font-size:14px;' +
      'font-weight:900;letter-spacing:2px;color:#ff6b6b;text-shadow:0 0 12px rgba(255,80,80,.6);opacity:0;' +
      'transition:opacity .25s;pointer-events:none;background:rgba(60,10,10,.45);padding:5px 14px;border-radius:9px;' +
      'border:1px solid rgba(255,100,100,.4)';
    document.body.appendChild(d);
    revEl = d;
    return d;
  }

  function getName() {
    const n = store(KEYS.name);
    return (n || '玩家').slice(0, 12);
  }

  function update(p, lapTime) {
    if (el.spd) el.spd.textContent = String(Math.round(Math.abs(p.speed) * 3.6 * 1.15));
    if (el.lap) el.lap.textContent = String(Math.min(p.lap, p.totalLaps));
    if (el.lapTotal) el.lapTotal.textContent = String(p.totalLaps);
    if (el.t1) el.t1.textContent = Math.max(0, lapTime).toFixed(2);
    if (el.score) el.score.textContent = String(calcScore(p));
    if (el.who) el.who.textContent = getName();
    syncCoins(p);
    syncNitro(p);
    const rev = ensureRevEl();
    const show = p.speed < -15;
    if (show !== rev._shown) { rev.style.opacity = show ? '1' : '0'; rev._shown = show; }
  }

  function calcScore(p) {
    const finish = p.finished ? Math.max(0, Math.round(2000 - (p.finishTime || 0) * 12)) : 0;
    return Math.round(p.driftScore || 0) + (p.smashCount || 0) * 200 + finish;
  }

  function setFps(v) {
    if (!el.fps) return;
    el.fps.textContent = v + ' FPS';
    el.fps.style.color = v >= 45 ? '#8ef7c8' : (v >= 25 ? '#ffd166' : '#ff6b6b');
  }

  // ── 金币：本局拾取数 + 余额 ──
  function syncCoins(p) {
    if (el.coinGot) el.coinGot.textContent = '+' + (p.coinGot || 0);
    if (el.coinHud) el.coinHud.classList.toggle('show', running || (p.coinGot || 0) > 0);
  }
  // 由 main.js 直接设置余额文字（金币变化时调一次，不必每帧）
  function setCoinBalance(n) {
    const b = document.getElementById('coinBal3d');
    if (b) b.textContent = String(n);
  }

  // ── 氮气：3 格气条 + 释放态 ──
  let nitroSig = '';
  function syncNitro(p) {
    const fire = (p.nitroTimer || 0) > 0;
    const sig = Math.round((p.charge || 0) * 20) + '|' + (fire ? 1 : 0);
    if (sig === nitroSig) return;
    nitroSig = sig;
    if (el.nitroBar) {
      const segs = el.nitroBar.children;
      for (let i = 0; i < segs.length; i++) {
        const v = (p.charge || 0) - i;
        segs[i].className = v >= 0.995 ? 'full' : (v > 0.04 ? 'half' : '');
      }
    }
    if (el.nitroHint) {
      el.nitroHint.textContent = fire ? '喷射中' : ((p.charge || 0) >= 1 ? '点 N₂ / Shift' : '漂移集气');
    }
    if (el.nitro) {
      el.nitro.classList.toggle('on', (p.charge || 0) > 0.02 || fire);
      el.nitro.classList.toggle('fire', fire);
    }
    const btn = document.getElementById('nitroBtn3d');
    if (btn) {
      btn.classList.toggle('ready', (p.charge || 0) >= 1);
      btn.classList.toggle('fire', fire);
    }
  }

  function syncInvert(invert, unlocked) {
    const badge = document.getElementById('invBadge');
    if (badge) {
      badge.textContent = invert ? '↔ 模式 A' : '→ 模式 B';
      badge.className = invert ? '' : 'off';
    }
    const box = document.getElementById('invBox');
    const lock = document.getElementById('invLock');
    const exp = document.getElementById('invExplain');
    if (box) box.style.display = unlocked ? 'flex' : 'none';
    if (lock) lock.style.display = unlocked ? 'none' : 'block';
    if (exp) exp.style.display = unlocked ? 'block' : 'none';
    document.querySelectorAll('.invbtn').forEach((b) => {
      const on = (b.getAttribute('data-inv') === '1') === invert;
      b.classList.toggle('on', on);
      b.style.background = on ? 'rgba(255,180,60,.22)' : 'rgba(255,255,255,.06)';
      b.style.borderColor = on ? 'rgba(255,190,80,.6)' : 'rgba(140,200,255,.25)';
      b.style.color = on ? '#ffc078' : '#9dbdd8';
    });
  }

  function bindInvertButtons(onChange) {
    document.querySelectorAll('.invbtn').forEach((b) => {
      b.addEventListener('click', () => onChange(b.getAttribute('data-inv') === '1'));
    });
  }

  function restorePanel() {
    if (!el.panel) return;
    el.panel.innerHTML = panelHome;
    if (el.d3cd && !el.d3cd.textContent) applyLock();   // 恢复「距正式版」倒计时（避免重复起循环）
    showOverlay();
  }

  function hideOverlay() { if (el.overlay) el.overlay.classList.add('hide'); }
  function showOverlay() { if (el.overlay) el.overlay.classList.remove('hide'); }

  function showKeyHints() {
    if (!el.keyHints) return;
    const coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
    if (coarse) return;
    el.keyHints.style.display = 'grid';
    setTimeout(() => { el.keyHints.style.display = 'none'; }, 3000);
  }

  function countdownPanel(p) {
    const panel = el.panel;
    if (!panel) return;
    panel.innerHTML =
      '<div class="tag3d">RACE FINISHED</div>' +
      '<div class="title" style="font-size:30px">完成！</div>' +
      '<div class="sub" style="letter-spacing:3px">' + p.finishTime.toFixed(2) + ' 秒 · ' + p.totalLaps + ' 圈</div>' +
      '<div style="margin:18px 0;padding:14px 18px;border-radius:14px;background:rgba(255,201,60,.12);border:1.5px solid rgba(255,201,60,.5);max-width:300px;text-align:left">' +
      '<div style="font-size:12px;font-weight:900;color:#ffd166;letter-spacing:1px;margin-bottom:8px">本局金币</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:#cfe4f7;line-height:1.95">' +
      '<span>赛道拾取 ' + (p.coinGot || 0) + ' 枚</span><b style="color:#8ef7c8">+' + (p.coinsEarned || 0) + '</b></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:#cfe4f7;line-height:1.95">' +
      '<span>完赛奖励</span><b style="color:#8ef7c8">+' + (p.coinsRaceBonus || 0) + '</b></div>' +
      '<div style="height:1px;background:rgba(255,201,60,.28);margin:7px 0"></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900">' +
      '<span style="color:#ffd166">合计 +' + (p.coinTotal || 0) + '</span>' +
      '<span style="color:#eaf2ff">余额 ' + (p.coinBalance || 0) + ' 币</span></div>' +
      '<div style="margin-top:9px;font-size:10.5px;color:#8fa8c2;line-height:1.7">回车库可以解锁车漆，金币和 2D 版共用。</div></div>' +
      '<button class="go" id="againBtn">再来一局</button>' +
      '<div class="tip" style="margin-top:10px"><a href="../index.html" style="color:#67c6ff;text-decoration:none">← 回到 2D 版</a></div>' +
      '<div><a class="brandLock" href="https://github.com/gcy529/turbo-game" target="_blank" rel="noopener"><span>deepseek v4.1-flash -1017</span><span class="amp">&amp;</span><span class="by">gcy529</span></a></div>';
    const again = document.getElementById('againBtn');
    if (again) again.addEventListener('click', () => {
      if (onAgain) onAgain(); else location.reload();
    });
    showOverlay();
  }

  // ── 定时开放：2026-11-11 00:00（测试入口：网址加 #b）──
  function applyLock() {
    // 内测倒计时下线：直接标为可用，不再弹「距正式版 N 天」
    if (el.d3lock) el.d3lock.style.display = 'none';
    // 版本号直接标在首页标签上：能一眼确认加载的是不是最新版（躲开旧缓存）
    if (el.d3tag) el.d3tag.textContent = 'WEBGL · 3D 正式版 · v8';
  }

  return {
    el, setMsg, tickMsg, update, setFps, syncCoins, syncNitro, setCoinBalance,
    syncInvert, bindInvertButtons,
    hideOverlay, showOverlay, restorePanel, showKeyHints, countdownPanel, applyLock, getName, calcScore,
    setOnAgain(fn) { onAgain = fn; },
    setRunning(v) { running = !!v; },
  };
}
