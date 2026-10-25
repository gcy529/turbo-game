# CHANGELOG — turbo-game 2D「进不去游戏」修复

日期：2026-10-25
基线文件：index.html，304,308 字节 / 6,530 行（仓库 main 版）
修复后：index.html，308,122 字节 / 6,572 行（增量全部是注释、CONFIG 与存档封装，玩法与美术一行未改）

---

## 一、结论：根因是一个作用域错误（ReferenceError），不是文件被改坏

游戏并没有被“改成只剩首页”，HTML 与脚本都是完整的。真正的原因是**第一帧渲染就抛异常**，
异常从渲染函数一路冒泡到启动函数 `boot()`，把 `boot()` 后半段（所有首页按钮绑定、主循环启动）全部跳过：

```
Uncaught ReferenceError: isPlayer is not defined
    at drawPlayerCar (index.html:2362:22)
    at renderView    (index.html:2529:25)
    at render        (index.html:2730:7)
    at boot          (index.html:6276:5)
    at index.html:6367:3
```

### 为什么会抛
`isPlayer` 只是 `drawCarBody(x, y, w, h, color, isPlayer)`（第 1838 行）的**形参**，
而 `drawPlayerCar(p, scale)`（第 2236 行）里在三个地方直接用了这个名字：
- 第 2362 行 `ctx.shadowBlur = isPlayer ? 14 : 6;`
- 第 2363 行 `ctx.fillStyle = 'rgba(255,20,60,' + (isPlayer ? 0.55 : 0.35) + ')';`
- 第 2396 行 `if (isPlayer) {`
并且在 `drawPlayerCar` 内、乃至整个文件里都没有任何 `isPlayer` 的声明（全文只此 4 处出现）。
于是首帧必然抛 `ReferenceError`。

### 为什么表现是“只剩首页一层皮”
`boot()` 第 6276 行调 `render()`，第 6277 行才 `requestAnimationFrame(frame)`，
第 6279 行之后才是 `toSetup / homeDaily / homeSolo / homeDuo / langBtn` 等所有首页按钮的绑定。
`render()` 一抛，这一整段都执行不到：
- 首页的「1P 单人挑战」「2P 双人对战」「开始设置」等按钮**全都没有 click 监听**，点了没反应；
- 主循环 `frame` 没启动，canvas 永远停在一张空画布（首帧只清理到一半就中断）。

所以看起来是“首页还在、但进不去”，实际是首页以下的功能全都没初始化。

## 二、改了什么

1. **根因修复（唯一的行为性改动）**：`drawPlayerCar()` 开头显式声明 `var isPlayer = true;`（新第 2272 行）。
   玩家车本就应当走“玩家”分支，因此第 2362/2363/2396 行那三个表达式的取值与作者原意一致
   （发光 14、尾灯 alpha 0.55、车身外发光边框绘制），渲染观感与修好后应有的样子不变。
   没有采用删掉这三行的做法，因为那会丢掉作者本来想要的玩家车高亮效果。

2. **CONFIG 集中配置（新第 654–671 行，纯重构）**：新增 `CONFIG` 对象，
   把车辆 / 地图 / 天气 / 视角的默认值收进来，原有初始化改为从 CONFIG 读取，取值与原值完全一致：
   - `MAX_SPEED = SEG_LEN * CONFIG.car.maxSpeedFactor`（60，原 60）
   - `TOTAL_LAPS = CONFIG.map.laps`（2）
   - `CAM_VIEW = CONFIG.view.default`（1）
   - `selectedCar = CONFIG.car.default`（'street'）
   - `WEATHER = CONFIG.weather.default`（'clear'）
   - `selectedMap = CONFIG.map.default`（'dusk'）
   - `selectedLaps = CONFIG.map.laps`（2）

3. **存档读写收敛（36 处 → 3 个函数）**：新增 `loadSave(key)` / `saveSave(key, value)` / `clearSave(key)`
   （新第 668–674 行），把这 36 处 `localStorage.getItem / setItem / removeItem`
   全部替换为这三个函数，每个函数自带 try/catch（隐私模式、配额满时返回 null / false，与原代码里逐处 try/catch 的行为一致）。
   文件里现在只剩这 3 个函数内部各一直接调用 `localStorage`（全文 `localStorage.` 计数 = 3）。

4. **分节注释横幅**：脚本按功能切成五段，实际落点（新文件行号）——
   - ① 配置段 CONFIG — 第 654 行
   - ② 物理与碰撞段 — 第 982 行
   - ③ 渲染段 — 第 1499 行
   - ⑤ UI 与存档段 — 第 4405 行
   - ④ 输入段 — 第 6044 行
   说明：这是**按原文件实际排列顺序标注的，不是把代码搬过去重排**。原文件里输入处理（键盘/触摸/陀螺仪）
   本来就写在各绘制与 UI 函数之后，为了不引入搬迁风险，横幅按真实位置打，编号也就没有严格递增。
   如果要真正把 5 段搬成物理上连续的 5 个区块，需要移动数千行代码，那属于另一件事，本次故意没做。

## 三、怎么验证的

无头 Chromium（Chromium 155，1280×800，`--headless=new`，本地 http 服务）加载同一份 index.html，
CDP 采集 `Runtime.exceptionThrown` / console error / 截图 / canvas 像素采样。

**修复前**：1 个未捕获异常（上面那段 ReferenceError 原文）；canvas 410×256，采样 262 点，
**有像素的点 = 0**（整张空白）。这是本地对线上同一份 304,308 字节文件的复现。

**修复后**：**0 个未捕获异常**、console 0 个 error（除 manifest.json / icon-192.png 的 404，见下），
按 首页 → 1P 单人挑战 → 向导下一步 → 开始比赛 点进去后：
- canvas 410×256（像素风 DPR 0.32，与 `resize()` 的设计一致），采样 262 点全部有像素（262/262）；
- `#fpsBox` 显示 `60 FPS`，说明 `requestAnimationFrame(frame)` 主循环已经跑起来；
- 倒计时提示 `#msg` 显示 `1`，说明 `startRace()` 已进入赛道并开始倒计时；
- 调试钩子 `window.__T.view()` 可读：`{"CAM_VIEW":1,…,"camH":280,"carScale":1.3,"drawCar":true}`；
- 截图 `verify/fixed-2-ingame.png`（349,573 B）与 `verify/fixed-3-ingame-later.png`（344,136 B）
  明显大于首页截图 `verify/fixed-1-home.png`（71,027 B），画面已从静态首页变为赛道场景。

原始采集数据见 `verify/fixed-verify.json`（含 exceptions 数组为空、各步骤状态与像素采样）。

复现命令（本地即可跑）：
```bash
cd 解压目录 && python3 -m http.server 8099   # 然后浏览器打开 http://127.0.0.1:8099/index.html
```

## 四、本次没动的地方（明确边界）

- **玩法与美术一行未改**：车、赛道、天气、音效、计分、排行榜、成就、幽灵车、邀请码逻辑全部原样，只动了上面 4 处。
- **index-3d.html 未动**（它仍是 2,458 字节的空壳，是 3D 入口的问题，不属于本次 2D 修复范围）。
  首页上的「逆反 3D」按钮仍会进到空壳页。
- **manifest.json / icon-192.png 未取到**：本地验证时这两个请求 404（仓库里是否有我未在本轮核实），
  它们只影响 PWA 安装与图标，不影响游戏运行。若线上也 404，补这两个文件即可。
- **sw.js 未改**：它是网络优先 + 缓存兜底，不存在把旧版本永久钉住的问题；
  排查中也确认过“加载到旧缓存”不是本次原因（异常来自当前文件的当前行号）。
- **未推送**：本环境到 github.com 的出口被拦、且无有效令牌，压缩包解压后自行替换 index.html 再推送即可。

## 五、文件清单

- `index.html` —— 修复后可直接替换部署的 2D 主文件
- `verify/fixed-1-home.png` —— 修复后首页
- `verify/fixed-2-ingame.png` —— 点进比赛后的赛道（含倒计时）
- `verify/fixed-3-ingame-later.png` —— 再跑 1.5 秒后
- `verify/fixed-verify.json` —— 无头采集原始数据（exceptions / console / 各步状态）
