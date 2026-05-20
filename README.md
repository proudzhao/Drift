# Drift

Drift 是一个轻量的桌面弹幕悬浮工具。它可以连接 B 站直播间，将直播弹幕以透明置顶窗口的形式显示在桌面上，适合边看直播、边学习、边工作时使用。

## 功能特性

- B 站直播间弹幕接入
- 透明、置顶、无边框弹幕窗口
- 鼠标穿透显示模式，不影响操作桌面和其他应用
- 编辑模式下可拖动和调整弹幕区域

## 下载安装

前往 Releases 页面下载：

[Download Drift](https://github.com/proudzhao/Drift/releases)

macOS 用户下载 `.dmg` 文件，Windows 用户下载 `.exe` 或 `.msi` 安装包。

> 当前版本尚未进行代码签名。macOS 或 Windows 可能会提示无法验证开发者。

## 使用方式

1. 启动 Drift。
2. 打开设置窗口。
3. 输入 B 站直播间房间号。
4. 点击连接。
5. 弹幕会显示在透明悬浮窗口中。

默认快捷键：

```text
macOS: Command+Option+K
Windows: Control+Alt+K
```

该快捷键用于切换弹幕窗口编辑模式。

## 本地开发

项目基于 Tauri、React、TypeScript 和 Rust。

环境要求：

- Node.js
- npm
- Rust
- Tauri 所需系统依赖

安装依赖：

```bash
cd drift
npm install
```

启动开发模式：

```bash
npm run tauri dev
```

构建应用：

```bash
npm run tauri build
```

## 项目结构

```text
Drift/
├── drift/
│   ├── src/              # 前端代码
│   ├── src-tauri/        # Tauri / Rust 后端代码
│   ├── package.json
│   └── vite.config.ts
├── .github/workflows/    # GitHub Actions 发布流程
└── README.md
```
