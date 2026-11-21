# 开发指南

Open Tools 是 Windows 桌面应用。界面使用 Vue 3、TypeScript 和 WebView2，原生能力通过 Tauri 2 的 Rust 命令提供。仓库协作约定见 [AGENTS.md](../AGENTS.md)。

## 本地开发

在 Windows 上准备 Node.js 22、Rust MSVC 工具链、Visual Studio C++ 构建工具和 WebView2。开发命令会启动 Tauri 窗口，Vite 为窗口内的界面提供热更新。

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

`npm run build` 生成 Tauri 打包所用的界面资源，单独运行 Rust 测试前可用它准备 `dist/`。

本地打包运行 `npm run build:win`。程序 EXE 位于 `src-tauri/target/release/`，NSIS 安装包位于 `src-tauri/target/release/bundle/nsis/`。用于分发时使用安装包，随包部署 AI 运行库等资源。

面向 `master` 的 Pull Request 会运行 [PR 检查](../.github/workflows/check.yml)，包括前端类型检查、Vitest（含界面交互回归）、生产构建和 Windows Rust 测试。

## 开发专题

| 专题 | 内容 |
| --- | --- |
| [项目结构](development/PROJECT_STRUCTURE.md) | 前端与 Rust 目录、模块职责和共享代码 |
| [新增与维护工具](development/TOOL_DEVELOPMENT.md) | 工具注册、会话、分类和验证 |
| [多语言文案](development/I18N.md) | 公共文案、工具翻译、插值与新增语言 |
| [前端交互设计](development/FRONTEND.md) | 表单、运行反馈、切换动效、编辑与输出 |
| [数据存放与 AI 模型](development/STORAGE.md) | 应用数据目录、WebView2 存储、模型下载和运行库 |
| [Windows 构建与发布](release/RELEASE.md) | 本地打包、云端发布、Gitee 和在线更新 |
| [修改应用图标](../branding/README.md) | 远程切换与内置 Windows 图标 |

## 工具专题

- [时钟](tools/CLOCK.md)
- [MQTT 连接](tools/MQTT.md)
- [大文件编辑器](tools/LARGE_FILE.md)
- [Word 转 Markdown](tools/WORD_TO_MARKDOWN.md)
- [PDF 内容编辑](tools/PDF_EDITOR.md)
