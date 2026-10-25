# TURBO3D_FEATURES — 3D 版补齐 5 个缺失功能

基线：index-3d-backup-before-refactor.html（1043 行完整 3D 赛车）
红线：11.11 解锁机制 + 逆反玩法是有意设计，禁止当 bug 改

- [ ] 0. 恢复完整版为 index-3d.html（已完成 cp）
- [ ] 1. 选车界面：4 车定义（颜色/极速/加速/操控），overlay 选车卡片，localStorage 持久化，startRace 应用属性
- [ ] 2. 选图界面：4 图定义（半径/点数/起伏/扭曲），overlay 选图卡片，localStorage 持久化，buildTrackCurve 用选中参数（切换=reload）
- [ ] 3. 隧道效果：赛道特定 t 位加发光拱门环，进入隧道压暗环境光+雾，穿越成就
- [ ] 4. 跳台：赛道特定 t 位加楔形跳台，高速碾上给垂直速度，重力回落，车体抬起+相机跟随，飞跃成就
- [ ] 5. 成就系统：8 个成就定义，localStorage 持久化，游戏中解锁通知，完赛面板展示
- [ ] 6. node --check 验证内联 JS 语法
- [ ] 7. git add + commit + push origin main
