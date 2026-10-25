# 3D_REFURB — index-3d.html 5 块功能续活

基线：从 ed7c411 备份恢复 1088 行完整版（含赛道/NPC/物理/技能/粒子/日夜/逆反/11.11/陀螺仪）
约束：保留 11.11 解锁 + 逆反玩法（非 bug）；单文件；赛博朋克；ES5 变量；手机性能优先
模型：freellmapi/auto 自动路由（不手动指定）

- [x] 基线恢复 ed7c411 完整版 index-3d.html
- [ ] 通读全文，定位插入点（车辆/赛道生成/UI/localStorage）
- [ ] 块1：选车界面（4 车，颜色+stats 差异，存 localStorage）
- [ ] 块2：选图界面（≥2 赛道，改 curve 控制点，存 localStorage）
- [ ] 块3：成就系统（localStorage achievements 读写 + 展示）
- [ ] 块4：隧道效果（区间顶棚+变暗+出隧恢复）
- [ ] 块5：跳台（2-3 个，弹起+抛物线落地）
- [ ] 全文 node --check（提取 script）+ 浏览器 headless 验证无 JS 错
- [ ] git add -A + commit + push origin main
