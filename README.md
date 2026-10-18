# 极速狂飙 Turbo Racer

单文件 HTML 赛车游戏，零依赖。

- `index.html` — 双人分屏对战（P1: W/A/D，P2: ↑/←/→）
- `solo.html` — 单人练习
- `home.html` — 入口选择页

## 部署

### Cloudflare Pages（推荐，免费无限流量）
```bash
npx wrangler pages deploy . --project-name turbo-racer
```

### Netlify（拖拽即可）
把整个文件夹拖到 https://app.netlify.com/drop

### 本地
双击 index.html
