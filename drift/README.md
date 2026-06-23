# Drift App

这是 Drift 的 Tauri 应用工程目录，包含 React 前端、Rust 后端、窗口配置和打包资源。

## 技术栈

- Tauri 2.x
- React + TypeScript + Vite
- Rust async / WebSocket / B 站弹幕协议解析
- B 站扫码登录、系统凭据存储和普通文本弹幕发送
- Tailwind CSS utilities + Drift 基础 UI 组件；弹幕运行时动画和少量复杂样式保留原生 CSS

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
├── App.tsx                   # Tauri 窗口分发和主窗口组合
├── App.css                   # 弹幕运行时动画、消息类型效果和全局窗口基础样式
├── components/
│   ├── ui/                   # Drift 基础 UI 组件
│   ├── control/              # 设置窗口组件
│   ├── DanmakuOverlay.tsx    # 弹幕层
│   ├── DanmakuTrack.tsx      # 单条弹幕
│   ├── DanmakuHistoryDrawer.tsx # 弹幕历史抽屉
│   ├── EditModePanel.tsx     # 编辑模式浮层
│   ├── MockDanmakuPanel.tsx  # Mock 弹幕生成控件
│   └── SendDanmakuWindow.tsx # 弹幕发送窗口
├── data/
│   └── mockDanmaku.ts
├── styles/
│   ├── tailwind.css          # Tailwind theme/utilities 入口和 Drift token
│   ├── control-panel.css     # 残留控制面板 CSS 聚合入口
│   └── control-panel/        # 常用直播间列表和房间号帮助弹窗等残留复杂样式
├── hooks/
│   ├── useDanmakuRuntime.ts
│   └── control/
├── types/
│   ├── auth.ts
│   ├── config.ts
│   └── danmaku.ts
└── utils/
    ├── classNames.ts
    ├── danmakuRuntime.ts
    ├── danmakuStats.ts
    ├── filterRules.ts
    └── qrCode.ts

src-tauri/
├── src/
│   ├── app_config.rs
│   ├── bilibili/
│   │   ├── auth.rs
│   │   ├── cookies.rs
│   │   ├── diagnostics.rs
│   │   ├── http.rs
│   │   ├── protocol.rs
│   │   ├── send/
│   │   ├── session.rs
│   │   ├── types.rs
│   │   └── ws.rs
│   ├── logging.rs
│   ├── tray.rs
│   ├── update_check.rs
│   ├── window_control/
│   ├── lib.rs
│   └── main.rs
├── icons/
└── tauri.conf.json
```
