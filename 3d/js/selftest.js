// ─────────────────────────────────────────────────────────────
// selftest.js · 无头验证模块（只在 index-3d.v2.html?selftest=1 时加载）
// 输出：<pre id="selftest-out"> 里的 JSON、document.title、body[data-selftest]
// 用法：?selftest=1&frames=120        → 跑验证
//       ?showcase=1&angle=35&dist=9   → 只摆机位出图（美术检查用）
// ─────────────────────────────────────────────────────────────
const q = new URLSearchParams(location.search);
const out = document.createElement('pre');
out.id = 'selftest-out';
out.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font-size:11px;line-height:1.5;color:#7dffa8;' +
  'background:rgba(0,0,0,.78);padding:10px 12px;max-width:92vw;max-height:52vh;overflow:auto;' +
  'white-space:pre-wrap;border-radius:8px;border:1px solid rgba(120,255,180,.3)';
document.body.appendChild(out);

const errors = [];
window.addEventListener('error', (e) => errors.push('error: ' + (e.message || e.type)));
window.addEventListener('unhandledrejection', (e) => errors.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));

function ready() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (window.__TURBO && window.__TURBO.ready) return resolve(window.__TURBO);
      if (performance.now() - t0 > 20000) return resolve(null);
      setTimeout(tick, 50);
    };
    tick();
  });
}

async function showcase(T) {
  const angle = (parseFloat(q.get('angle') || '35') * Math.PI) / 180;
  const dist = parseFloat(q.get('dist') || '9');
  const height = parseFloat(q.get('height') || '3.2');
  T.start({ skipCountdown: true });
  T.step(45);
  T.stop();
  T.pause();            // 停掉主循环，否则跟随相机会覆盖固定机位
  out.style.display = 'none';
  const car = T.playerCar;
  // 以「车头自身朝向」为基准摆机位，避免把正反看混：0° = 正对车头，180° = 正对车尾
  if (q.get('markers') === '1') T.markers(true);
  const nose = car.localToWorld(new car.position.constructor(0, 0, 1)).sub(car.position).normalize();
  const rx = -nose.z, rz = nose.x;
  const dirX = nose.x * Math.cos(angle) + rx * Math.sin(angle);
  const dirZ = nose.z * Math.cos(angle) + rz * Math.sin(angle);
  const cam = T.stage.camera;
  const center = car.position.clone();
  cam.position.set(center.x + dirX * dist, center.y + height, center.z + dirZ * dist);
  cam.lookAt(center.x, center.y + 0.55, center.z);
  cam.fov = 38;
  cam.updateProjectionMatrix();
  const render = () => { T.stage.renderer.render(T.stage.scene, cam); requestAnimationFrame(render); };
  render();
  const tan = T.track.posAt(T.player.t, T.player.lateral).tan.clone().normalize();
  const nw = car.localToWorld(new car.position.constructor(0, 1.5, 3.1));
  const tw = car.localToWorld(new car.position.constructor(0, 1.5, -3.1));
  const camInfo = {
    camDistNose: +cam.position.distanceTo(nw).toFixed(2),
    camDistTail: +cam.position.distanceTo(tw).toFixed(2),
    camPos: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    carPos: [+car.position.x.toFixed(2), +car.position.y.toFixed(2), +car.position.z.toFixed(2)],
  };
  out.textContent = JSON.stringify({
    mode: 'showcase', angleDeg: +((angle * 180) / Math.PI).toFixed(1), dist,
    nose: { x: +nose.x.toFixed(3), y: +nose.y.toFixed(3), z: +nose.z.toFixed(3) },
    tangent: { x: +tan.x.toFixed(3), y: +tan.y.toFixed(3), z: +tan.z.toFixed(3) },
    noseDotTangent: +nose.dot(tan).toFixed(3),
    camInfo,
    telemetry: T.telemetry(),
  }, null, 1);
  document.title = 'SHOWCASE ' + Math.round((angle * 180) / Math.PI);
}

async function run(T) {
  const frames = parseInt(q.get('frames') || '120', 10);
  const samples = [];
  const t0 = performance.now();
  out.textContent = 'phase: start';
  T.start({ skipCountdown: true });
  out.textContent = 'phase: warmup';
  T.step(2);
  for (let i = 0; i < frames; i++) { samples.push(T.step(1)); out.textContent = 'phase: run ' + i; }
  const elapsed = performance.now() - t0;

  const ups = samples.map((s) => s.upY);
  const dots = samples.map((s) => s.headingDot);
  const last = samples[samples.length - 1];
  out.textContent = 'phase: steer';
  // 第二轮：持续左右打方向（触发侧倾），确认侧倾不会把车翻过去
  const steerSamples = [];
  T.input.keys.right = true;
  for (let i = 0; i < 40; i++) steerSamples.push(T.step(1));
  T.input.keys.right = false; T.input.keys.left = true;
  for (let i = 0; i < 40; i++) steerSamples.push(T.step(1));
  T.input.keys.left = false;
  for (let i = 0; i < 20; i++) steerSamples.push(T.step(1));

  out.textContent = 'phase: flip';
  const flipZ = T.flipTest('z');
  const afterFlipZ = T.step(15);
  const flipX = T.flipTest('x');
  const afterFlipX = T.step(15);

  const summary = {
    threeRevision: window.__THREE_REVISION || null,
    frames,
    minUpY: Math.min(...ups),
    maxUpY: Math.max(...ups),
    minHeadingDot: Math.min(...dots),
    headingDotFirst: dots[0],
    headingDotLast: last.headingDot,
    finalState: last,
    steerPhase: {
      frames: steerSamples.length,
      minUpY: Math.min(...steerSamples.map((x) => x.upY)),
      maxAbsRoll: Math.max(...steerSamples.map((x) => Math.abs(x.roll))),
      minHeadingDot: Math.min(...steerSamples.map((x) => x.headingDot)),
    },
    flipTestZ: { before: flipZ.before, recovered: flipZ.recovered, afterUpY: afterFlipZ.upY },
    flipTestX: { before: flipX.before, recovered: flipX.recovered, afterUpY: afterFlipX.upY },
    runMs: Math.round(elapsed),
    pageErrors: errors.slice(0, 10),
    drawCalls: last.drawCalls,
    triangles: last.triangles,
  };
  summary.pass = {
    noPageErrors: errors.length === 0,
    neverFlipped: summary.minUpY > 0.9,
    neverReversed: summary.minHeadingDot > 0.9,
    steerKeepsUpright: Math.min(...steerSamples.map((x) => x.upY)) > 0.9,
    flipRecovers: flipZ.recovered && flipX.recovered && afterFlipZ.upY > 0.9 && afterFlipX.upY > 0.9,
    stillRunning: last.running === true && last.lap >= 1,
  };
  summary.ok = Object.values(summary.pass).every(Boolean);

  T.pause(); // 收工：停掉主循环，headless 才能尽快出 DOM
  out.textContent = JSON.stringify(summary, null, 1);
  document.body.dataset.selftest = summary.ok ? 'pass' : 'fail';
  document.title = 'SELFTEST ' + (summary.ok ? 'PASS' : 'FAIL') +
    ' minUpY=' + summary.minUpY + ' minDot=' + summary.minHeadingDot;
}

ready().then((T) => {
  if (!T) {
    out.textContent = JSON.stringify({ ok: false, reason: 'window.__TURBO 未就绪，模块可能没加载成功', errors }, null, 1);
    document.body.dataset.selftest = 'fail';
    document.title = 'SELFTEST FAIL boot';
    return;
  }
  if (q.get('audit') === '1') {
    out.textContent = JSON.stringify(T.modelAudit(), null, 1);
    document.title = 'AUDIT';
    T.pause();
    return;
  }
  if (q.get('showcase') === '1') showcase(T).catch((e) => { out.textContent = 'showcase error: ' + e.message; });
  else run(T).catch((e) => {
    out.textContent = JSON.stringify({ ok: false, error: String(e && e.stack || e), errors }, null, 1);
    document.body.dataset.selftest = 'fail';
  });
});
