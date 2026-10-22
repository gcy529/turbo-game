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
- ✅ 技能系统（护盾/磁力/缓时/氮气）
- ✅ 2D 视觉升级（粒子+霓虹）

## v2 目标
1. ~~**添加技能系统**~~ ✅ 完成
2. ~~**视觉升级**~~ ✅ 2D 完成，3D 待对齐
3. **代码模块化**（进行中）

## 不做的
- ❌ 不改核心玩法（保留 OutRun 风格）
- ❌ 不抄袭天天飞车的 UI/车身

## 文件结构（目标）
```
js/
  core.js      — 游戏循环、状态
  input.js     — 键盘/触摸/陀螺仪
  renderer.js  — Canvas 渲染
  car.js       — 车辆物理
  track.js     — 赛道生成
  skills.js    — 技能系统
index.html     — 2D 入口
index-3d.html  — 3D 入口
solo.html      — 单人挑战
```

## 里程碑
- [x] Phase 1: 技能系统原型
- [x] Phase 2: 2D 视觉升级（粒子+霓虹）
- [x] Phase 3: 3D 画质对齐
- [ ] Phase 4: 代码模块化
- [ ] Phase 5: 测试+推送

## 问题修复
- ✅ GitHub Token 丢失 → 从 .turbo-game 副本找到并推送
- ✅ 流式超时 10s → 改为 90s（解决 Internal error）
