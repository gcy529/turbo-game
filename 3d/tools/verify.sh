#!/usr/bin/env bash
# 无头验证：真实浏览器加载 index-3d.v2.html，跑 120 帧并检查
#   ① 页面无 console/page 报错  ② 车体 up.y 全程 > 0.9（不翻车）
#   ③ 车头与赛道切线点积全程 > 0.9（不倒着开）  ④ 主动打翻后能自动复位
# 用法：bash tools/verify.sh            （默认端口 8712）
#       CHROME=/path/to/chrome bash tools/verify.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8712}"
CHROME="${CHROME:-/usr/bin/chromium}"
PROXY_ARGS=()
# 需要出口代理的环境（例如企业网络 / 沙箱）自动带上
if [ -n "${HTTPS_PROXY:-}" ]; then
  PROXY_ARGS=(--proxy-server="$HTTPS_PROXY" --proxy-bypass-list=127.0.0.1,localhost --ignore-certificate-errors)
fi
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1
"$CHROME" --headless=new --no-sandbox --disable-dev-shm-usage \
  --enable-unsafe-swiftshader --use-angle=swiftshader "${PROXY_ARGS[@]}" \
  --window-size=640,360 --virtual-time-budget=180000 --dump-dom \
  "http://127.0.0.1:$PORT/index-3d.v2.html?selftest=1&frames=120" > /tmp/turbo-selftest.html 2>/dev/null
python3 - <<'PY'
import re, sys
s = open('/tmp/turbo-selftest.html', encoding='utf-8', errors='replace').read()
m = re.search(r'<pre id="selftest-out"[^>]*>(.*?)</pre>', s, re.S)
if not m:
    print('未拿到验证输出（页面可能没加载成功）'); sys.exit(2)
print(m.group(1))
sys.exit(0 if '"ok": true' in m.group(1) else 1)
PY
