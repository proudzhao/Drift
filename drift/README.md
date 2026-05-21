# Drift App

这是 Drift 的 Tauri 应用工程目录，包含 React 前端、Rust 后端、窗口配置和打包资源。

## 技术栈

- Tauri 2.x
- React + TypeScript + Vite
- Rust async / WebSocket / B 站弹幕协议解析
- 原生 CSS 动画和设置页样式

## 运行

```bash
npm install
npm run tauri -- dev
```

## 构建

```bash
npm run build
npm run tauri -- build
```

## 目录概览

```text
src/
├── App.tsx
├── App.css
├── components/
│   ├── control/              # 设置窗口组件
│   ├── DanmakuOverlay.tsx    # 弹幕层
│   ├── DanmakuTrack.tsx      # 单条弹幕
│   └── EditModePanel.tsx     # 编辑模式浮层
├── data/
│   └── mockDanmaku.ts
└── types/
    ├── config.ts
    └── danmaku.ts

src-tauri/
├── src/
│   ├── app_config.rs
│   ├── bilibili.rs
│   ├── logging.rs
│   ├── tray.rs
│   ├── window_control.rs
│   ├── lib.rs
│   └── main.rs
├── icons/
└── tauri.conf.json
```
