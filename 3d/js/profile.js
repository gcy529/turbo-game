// ─────────────────────────────────────────────────────────────
// profile.js · 3D 版读同一份玩家档案（localStorage 与 2D 共用）
// 六字 ID / 金币 / 解锁，字段与 index.html 里的 Profile 保持一致
// ─────────────────────────────────────────────────────────────

const KEY = 'turbo-racer-profile';
const ID_CHARS = 'ACDEFGHJKLMNPQRSTUVWXYZ2345679';   // 去掉 0/O/1/I/B/8 等易混字符

export function genId() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  return s;
}

export function readProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { p = null; }
  if (!p || typeof p !== 'object') {
    p = { v: 1, id: genId(), coins: 0, cars: ['street'], maps: ['dusk'], races: 0, dist: 0, created: Date.now() };
  }
  if (!/^[A-Z0-9]{6}$/.test(String(p.id || ''))) p.id = genId();
  p.coins = Math.max(0, Math.floor(+p.coins || 0));
  if (!Array.isArray(p.cars) || !p.cars.length) p.cars = ['street'];
  if (!Array.isArray(p.maps) || !p.maps.length) p.maps = ['dusk'];
  if (!Array.isArray(p.liveries) || !p.liveries.length) p.liveries = ['mint'];
  if (!p.livery) p.livery = 'mint';
  writeProfile(p);
  return p;
}

export function writeProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
  return p;
}

// 扣钱并解锁（返回 'ok' | 'poor' | 'owned'）
export function buyLivery(profile, livery) {
  if (!profile) return 'poor';
  if (profile.liveries.indexOf(livery.id) >= 0) return 'owned';
  if (profile.coins < livery.price) return 'poor';
  if (livery.price > 0) profile.coins -= livery.price;
  profile.liveries.push(livery.id);
  profile.livery = livery.id;
  writeProfile(profile);
  return 'ok';
}

export function selectLivery(profile, livery) {
  if (!profile) return false;
  if (profile.liveries.indexOf(livery.id) < 0) return false;
  profile.livery = livery.id;
  writeProfile(profile);
  return true;
}
