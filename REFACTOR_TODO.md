# turbo-game 重构计划 v2

## 现状
- ✅ Phase 1: 技能系统已完成并推送
- ⏳ Phase 2: 2D 视觉升级（粒子+霓虹）
- ⏳ Phase 3: 3D 画质对齐
- ⏳ Phase 4: 代码模块化

## 问题修复
- ❌ GitHub Token 丢失 → 已从 .turbo-game 副本找到并推送
- ❌ 流式超时 10s 太短 → 已改为 90s

## Phase 2: 2D 视觉升级
1. 粒子系统（尾气/漂移火花/收集特效）
2. 霓虹风格（发光效果/渐变/光晕）
3. 技能道具视觉增强

## Phase 3: 3D 画质对齐
1. 提升粒子效果
2. 技能道具 3D 渲染
3. 光影优化

## Phase 4: 代码模块化
1. 提取 core.js（游戏循环/状态）
2. 提取 render-2d.js（Canvas 渲染）
3. 提取 render-3d.js（Three.js 渲染）
4. 共享技能系统逻辑

## 里程碑
- [ ] Phase 2 完成
- [ ] Phase 3 完成
- [ ] Phase 4 完成
- [ ] 最终测试+推送
