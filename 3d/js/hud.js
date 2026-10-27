// ─────────────────────────────────────────────────────────────
// hud.js · HUD 与所有 DOM 界面（速度/圈数/分数/技能条/结算面板/逆反开关/开放倒计时）
// ─────────────────────────────────────────────────────────────
import { FX, RACE, KEYS, store } from './config.js';

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
    skillUI: document.getElementById('skillUI3d'),
    skillPts: document.getElementById('skillPts3d'),
    skillBar: document.getElementById('skillBar3d'),
    startBtn: document.getElementById('startBtn'),
    keyHints: document.getElementById('keyHints'),
    d3lock: document.getElementById('d3lock'),
    d3cd: document.getElementById('d3cd'),
    d3tag: document.getElementById('d3tag'),
  };

  let msgTimer = 0;
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
    if (el.skillPts) el.skillPts.textContent = '⭐ ' + p.skills.points;
    const def = FX.skillDefs[p.skills.active];
    if (el.skillBar) {
      el.skillBar.style.display = def ? 'flex' : 'none';
      if (def) {
        const n = el.skillBar.querySelector('.skill-name');
        const t = el.skillBar.querySelector('.skill-timer');
        if (n) n.textContent = def.icon + ' ' + def.name;
        if (t) t.textContent = Math.ceil(p.skills.timer) + 's';
        el.skillBar.style.borderColor = '#' + def.color.toString(16).padStart(6, '0');
      }
    }
    if (el.skillUI) el.skillUI.classList.toggle('show', p.skills.points > 0 || !!p.skills.active);
    syncSkillButtons(p.skills);
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

  function syncSkillButtons(skills) {
    document.querySelectorAll('.skill-btn').forEach((btn) => {
      const def = FX.skillDefs[btn.getAttribute('data-skill')];
      if (!def) return;
      const can = skills.points >= def.cost;
      btn.style.opacity = can ? '1' : '0.4';
      btn.style.cursor = can ? 'pointer' : 'not-allowed';
      btn.classList.toggle('active', skills.active === btn.getAttribute('data-skill'));
    });
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

  function bindSkillButtons(skills, onActivated) {
    // HTML 里原来的 onclick="activateSkill3d(...)" 指向一个根本不存在的全局函数，
    // 每次点击都是 ReferenceError，技能完全用不了。这里改成真正的监听。
    document.querySelectorAll('.skill-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const type = btn.getAttribute('data-skill');
        const res = skills.activate(type);
        if (res && res.ok && onActivated) onActivated(type);
        syncSkillButtons(skills);
      });
    });
    syncSkillButtons(skills);
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
      '<div style="margin:18px 0;padding:14px 18px;border-radius:14px;background:rgba(255,180,60,.12);border:1.5px solid rgba(255,190,80,.5);max-width:300px">' +
      '<div style="font-size:14px;font-weight:900;color:#ffc078;letter-spacing:1px;margin-bottom:6px">🏆 解锁隐藏设置</div>' +
      '<div style="font-size:11.5px;color:#cfe4f7;line-height:1.7">有个开关解锁了<br>' +
      '<span style="color:#6f8db0;font-size:10.5px">下次开始前，试试换一种开法</span></div></div>' +
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
    if (el.d3tag) el.d3tag.textContent = 'WEBGL · 3D 版';
  }

  return {
    el, setMsg, tickMsg, update, setFps, syncSkillButtons, bindSkillButtons, syncInvert, bindInvertButtons,
    hideOverlay, showOverlay, restorePanel, showKeyHints, countdownPanel, applyLock, getName, calcScore,
    setOnAgain(fn) { onAgain = fn; },
  };
}
