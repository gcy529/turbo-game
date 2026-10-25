# TURBO 3D · 逆反模式 —— 模块化重构版（v2）

以提交 `ed7c411` 的 `index-3d.html`（1,088 行 / 55,901 B 单文件）为逻辑基线重构：
玩法（赛道、关卡、逆反模式、技能、NPC、圈速计分）保留，修掉翻车与倒着开两个 bug，
车模与材质整段重做，three.js 改为锁定版本的 CDN ES module。

- 入口页：`index-3d.v2.html`（**独立文件名，不覆盖仓库里现有的 `index-3d.html`**）
- 引擎：three.js **r160**（`three@0.160.0`，ES module + importmap），仓库内不再需要 `three.min.js`
- 依赖：零外部模型、零外部图片、零构建步骤；车模/贴图/天空全部程序化生成

## 1. 怎么跑到浏览器里

ES module + importmap 不能用 `file://` 直接双击打开（浏览器会拦跨源模块），必须走 http：

```bash
cd turbo-game-3d-refactor
python3 -m http.server 8000      # 或 npx serve / 任何静态服务器
# 浏览器打开 http://127.0.0.1:8000/index-3d.v2.html
```

部署到 GitHub Pages 后直接访问 `https://<你的域>/index-3d.v2.html` 即可。

## 2. 替换步骤（不会动你现有文件）

1. 把 `index-3d.v2.html` 放到仓库根目录；
2. 把整个 `js/` 目录放到仓库根目录（与 `index-3d.v2.html` 同级）；
3. 访问 `/index-3d.v2.html` 验收，满意后再决定要不要切换入口。

想让 `/3d` 路由与 2D 首页那个「逆反 3D」按钮指向新版，需要你点头后改两处（本次未改动）：

- `_redirects` 里指向 `/index-3d.html` 的那条，把目标改成 `/index-3d.v2.html`；
- `index.html` 第 535 行附近的 3D 按钮 `href`，改成 `index-3d.v2.html`。

`three.min.js` 本次**没有从仓库删除**（删文件要你确认）：新版页面不再引用它，
你确认后可以直接移除，603 KB 省下来。

## 3. CDN 与换源

`index-3d.v2.html` 顶部 importmap（改这两行即可换源）：

```json
"three": "https://registry.npmmirror.com/three/0.160.0/files/build/three.module.js",
"three/addons/": "https://registry.npmmirror.com/three/0.160.0/files/examples/jsm/"
```

主用 npmmirror（国内直连、实测 0.34s 返回、MIME 正确）。备选：

- `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`（addons 同路径 `examples/jsm/`）
- `https://unpkg.com/three@0.160.0/build/three.module.js`

版本必须锁死 `0.160.0`：r155 之后灯光强度改成物理量纲、r152 之后默认 sRGB 输出，
换大版本会整体变亮/变暗，需要重调 `js/config.js` 里的 `THEME.*.sun.intensity` 与 `hemi.intensity`。

## 4. 这次改了什么

### 4.1 两个致命 bug（都用数值验证过）

| 位置（ed7c411） | 问题 | 改法 |
|---|---|---|
| 第 815 行 `lookTgt = position.clone().sub(fwd)` | 目标点放到车身后方，车头朝后 | `js/car.js` 的 `poseCar()`：`lookAt(pos + fwd)` |
| 第 822–823 行 `playerCar.rotation.z = _rollT` | 每帧写欧拉角 z，抹掉 yaw，车当场翻过来 | 侧倾 `rotateZ(roll)` 合进四元数再 slerp，`rotation.z` 全程不写 |
| 全文无翻车复位 | 翻一次就回不来 | 每帧检查局部 `up.y`，`< 0.3` 立即摆正并清侧倾 |

### 4.2 车模与材质（本次重点）

- **车身**：改用「超椭圆断面 + 沿 Z 放样」生成楔形车体（`loft()`），不再是几个 Box 叠起来；
  8 个断面控制车宽/车高/前后收腰，法线自动平滑，车顶与轮拱过渡连续。
- **座舱**：独立放样，按断面顶面斜率自动把前后风挡分到玻璃材质、车顶留在车漆材质。
- **车轮**：轮胎用 Torus（圆肩），轮毂单独 Cylinder + 6 根轮辐 + 中心盖；高模额外有刹车盘与卡钳；
  前轮随打方向偏转，四轮随速度滚转。
- **灯组**：细长灯腔 + 日行灯条（自发光材质），刹车/倒车时尾灯亮度自动拉高。
- **空气件**：前保险杠、前扰流板、侧裙、扩散器+竖鳍、双出排气、后视镜、带支柱的尾翼（高模）。
- **材质**：车漆 `MeshPhysicalMaterial`（clearcoat 清漆 + 金属度），玻璃半透 + 高 envMap，
  金属件 roughness/metalness 分明；PMREM 用程序化房间环境烘焙反射——没有它金属会发黑，这也是旧版「看起来糙」的一个隐性原因。
- **光照与场景**：ACES 色调映射、2048 级阴影相机跟随玩家、程序化渐变天空穹顶、地面接影、
  路肩红白块、沥青颗粒贴图（Canvas 生成）、起点格子线、树/灯柱改 InstancedMesh。
- **性能**：同材质静态零件在 `buildCar()` 末尾合并（`mergeByMaterial()`），
  实测 **draw call 从 ~494 降到 100–144、三角形 32k–44k**（随视角与视野内 NPC 数量波动，120 帧后采样）。

### 4.3 工程结构（每个文件 ≤ 300 行）

| 文件 | 行数 | 职责 |
|---|---|---|
| `js/config.js` | 121 | 车辆/赛道/天气/玩法数值、CDN 版本、localStorage 键名 |
| `js/scene.js` | 138 | 渲染器、相机、灯光、日夜主题、天空、PMREM 环境、阴影跟随 |
| `js/track.js` | 275 | 赛道曲线、路面/标线/路肩/护栏、起点线、树与灯柱、`posAt`/`curvatureAt` |
| `js/car.js` | 300 | 程序化车模、材质、`poseCar()` 姿态与翻车复位、轮子 |
| `js/input.js` | 122 | 键盘/触屏/陀螺仪、逆反模式 A/B、解锁状态 |
| `js/fx.js` | 141 | 粒子、技能道具、护盾球 |
| `js/skills.js` | 68 | 技能状态机（护盾/磁力/缓时/氮气） |
| `js/hud.js` | 189 | HUD、技能条、结算面板、逆反开关、11.11 开放倒计时 |
| `js/main.js` | 300 | 装配、主循环、圈数、NPC、碰撞、相机；`window.__TURBO` 测试接口 |
| `js/selftest.js` | 137 | 只在 `?selftest=1` 时加载的验证模块 |

另外修掉 `#overlay` 那条被错误嵌套的 CSS（`body.light3d #overlay` 原本写在 `#overlay` 声明块内部）。

## 5. 无头验证结果（实测，非推测）

复现命令：`bash tools/verify.sh`（内部就是起一个本地 http 服务 + headless Chromium 跑
`index-3d.v2.html?selftest=1&frames=120`）。原始输出存于 `evidence/selftest-pass.json`。

环境：Chromium 155 headless + SwiftShader 软件渲染，窗口 640×360，`--virtual-time-budget` 驱动。
这是**软件渲染**下的数值验证，不等于真机帧率。

| 检查项 | 通过条件 | 实测 |
|---|---|---|
| 页面报错 | 0 条 | `pageErrors: []`（另有 boot 失败兜底，加载失败会把原因显示在页面上） |
| 不翻车（120 帧） | 车体局部 `up.y` 全程 > 0.9 | 最小 **0.9935**，最大 0.9995 |
| 不倒着开（120 帧） | 车头方向·赛道切线 > 0.9 | 最小 **0.9984**，末帧 0.9998 |
| 打方向侧倾（100 帧，左右各 40 + 回正 20） | `up.y` > 0.9 | 最小 **0.9921**，最大侧倾 **0.1196 rad**（= 上限 0.12） |
| 主动打翻后复位（侧翻） | 一帧内恢复、`up.y` > 0.9 | 打翻前 `up.y = -1` → 复位后 **0.9972** |
| 主动打翻后复位（前后翻） | 同上 | 打翻前 `-1` → 复位后 **0.9977** |
| 仍在正常推进 | 帧末 running=true、圈数≥1 | t=0.0353、速度 52.87、圈 1 |
| 渲染开销（该场景采样） | — | draw call **100–144**，三角形 **32k–44k**，three **r160** |

`evidence/` 里另附两张实机渲染截图（侧面、车后 3/4），另有 `tools/verify.sh` 可一键复现上表。

## 6. 我确认没做 / 没验证的

- 没有推送任何东西到 GitHub：这台环境到 github.com 出口被拦（403）且无有效令牌；本次只交付可替换文件。
- 没有改仓库里的 `index-3d.html`（2,458 B 空壳）与 `_redirects`、`index.html`：都要你点头。
- 没有删除 `three.min.js`：同上。
- 没有真机 FPS：本环境只有 SwiftShader 软件渲染。真机上建议先看
  `#fpsBox`，若低于 45 再把 `js/config.js` 的 `NPC.count` 从 18 调到 12（draw call 大致线性下降）。
- 第 3 节里的 jsdelivr/unpkg 备选地址是通用路径，**在本环境只实测过 npmmirror 与 unpkg 可下载**，
  jsdelivr 在本环境超时（不代表你那边不通）。

## 7. 目录

```
turbo-game-3d-refactor/
├── index-3d.v2.html          # 入口页（importmap + 启动兜底）
├── js/                       # 10 个模块，全部 ≤300 行
├── tools/verify.sh           # 无头验证脚本
├── evidence/                 # 验证 JSON + 两张渲染截图
└── README.md
```
