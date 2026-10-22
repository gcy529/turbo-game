# turbo-game v2 重构计划

## 现状
- ✅ 竖屏设计（手机为主）
- ✅ 四车道双向
- ✅ 漂移系统（hold → release boost）
- ✅ 氮气加速（PERFECT/GOOD/EARLY 判定）
- ✅ 起步喷（LAUNCH 计时）
- ✅ 4 车 4 图 4 天气
- ✅ 陀螺仪转向
- ✅ 隧道/跳台/加速带
- ❌ 技能系统（缺失）
- ❌ 2D/3D 视觉不统一

## v2 目标
1. **添加技能系统**（天天飞车核心玩法）
   - 收集技能点 → 释放特殊能力
   - 技能：护盾/磁力/时间减缓/全屏氮气

2. **视觉升级**
   - 2D：霓虹风格 + 粒子系统
   - 3D：提升画质

3. **代码模块化**
   - 提取核心逻辑到 js/
   - 2D/3D 共享核心

## 不做的
- ❌ 不改核心玩法（保留 OutRun 风格）
- ❌ 不抄袭天天飞车的 UI/车身

## 文件结构
```
js/
  core.js      — 游戏循环、状态
  input.js     — 键盘/触摸/陀螺仪
  renderer.js  — Canvas 渲染
  car.js       — 车辆物理
  track.js     — 赛道生成
  skills.js    — 技能系统（新增）
index.html     — 2D 入口
index-3d.html  — 3D 入口
solo.html      — 单人挑战
```

## 里程碑
- [ ] Phase 1: 技能系统原型
- [ ] Phase 2: 2D 视觉升级（粒子+霓虹）
- [ ] Phase 3: 3D 画质对齐
- [ ] Phase 4: 代码模块化
- [ ] Phase 5: 测试+推送
