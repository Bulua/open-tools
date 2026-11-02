<div align="center">

<img src="app-icon.svg" width="96" height="96" alt="Open Tools" />

# Open Tools

[English](README.md) | 简体中文

**开发者工具百宝箱 · Windows 桌面应用**

JSON、编码、转换、图片、文档处理等常用小工具，集中在一个轻量、离线、开箱即用的桌面程序里。

[![构建状态](https://github.com/Bulua/open-tools/actions/workflows/build.yml/badge.svg)](https://github.com/Bulua/open-tools/actions/workflows/build.yml)
[![最新版本](https://img.shields.io/github/v/release/Bulua/open-tools?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC)](https://github.com/Bulua/open-tools/releases/latest)
[![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%2010%20%2F%2011-c96442)](#下载与安装)
[![许可证](https://img.shields.io/github/license/Bulua/open-tools?label=%E8%AE%B8%E5%8F%AF%E8%AF%81)](LICENSE)

[下载](#下载与安装) · [功能](#功能一览) · [使用技巧](#使用技巧) · [Star 趋势](#star-趋势)

</div>

---

## 简介

日常开发中经常需要格式化一段 JSON、解一个 Base64、换算时间戳、压缩几张图片……这些事情往往要打开不同的网站，还要担心数据被上传。

Open Tools 把这些常用工具放进一个桌面程序：

- **本地处理，数据不出本机**：除了 IP 查询和 Ping 这两个网络工具，所有处理都在你的电脑上完成，不上传任何内容。
- **轻量**：安装包只有几 MB，启动快，占用内存少。
- **一个窗口搞定**：顶部切换分类，左侧选择工具，`Ctrl K` 随时搜索。
- **切换不丢数据**：在不同工具之间来回切换，之前的输入和结果都会保留。
- **自动更新**：有新版本时程序内提示，一键更新。

## 功能一览

目前共 8 个分类、45 个工具。

| 分类 | 包含 |
| --- | --- |
| JSON | 格式化与校验（代码 / 树形视图）、差异对比、字符串转义、转 YAML 和 TypeScript 类型 |
| 文本编码 | Base64、URL / Unicode / HTML 编码、哈希计算、JWT 解码、随机密码、正则表达式测试、命名风格转换 |
| 时间 | 时间戳转换、时区转换与世界时间、Cron 表达式、倒计时提醒 |
| 计算换算 | 计算器、单位换算、进制转换、颜色转换 |
| 图片 | 压缩、格式转换、裁剪、旋转、调色、拼接、马赛克、水印、去背景（AI 识别主体）、取色、ICO 图标生成 |
| 音频 | 格式转换（含视频提取声音）、剪辑、拼接、录音机、文字转语音 |
| 视频 | B 站视频下载（可在线播放）、抖音无水印下载、视频转音频（直接复制原始音轨或转 MP3、M4A、WAV）、视频拼接 |
| 文档文件 | Word 转 PDF、PDF 转 Word、Word 加水印与去水印、PDF 页面编辑、PDF 去水印、Markdown 编辑预览与转 Word、文件压缩与解压 |
| 网络 | HTTP 请求、IP 地址与位置查询、Ping 测试、请求头转 JSON / cURL |

## 下载与安装

1. 打开 [Releases](https://github.com/Bulua/open-tools/releases/latest) 页面（国内可用 [Gitee 镜像](https://gitee.com/bulua/open-tools/releases)）。
2. 下载 `Open Tools_x.x.x_x64-setup.exe`。
3. 双击安装，完成后从开始菜单或桌面快捷方式打开。

**系统要求**：Windows 10 / 11（64 位）。程序依赖系统自带的 WebView2，Windows 10 及以上已内置，无需另外安装。

> **首次运行提示「Windows 已保护你的电脑」？**
> 这是因为程序暂未购买代码签名证书，并非安全问题。点击「更多信息」→「仍要运行」即可，之后不会再提示。

### 更新

程序启动时会自动检查新版本，有更新时右上角会出现「新版本」提示，点击即可下载安装并自动重启。也可以随时点击右上角的 <kbd>↑</kbd> 图标手动检查。

## 使用技巧

| 操作 | 说明 |
| --- | --- |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | 打开全局搜索，按工具名或说明查找所有分类中的工具，回车直接打开 |
| 左侧搜索框 | 只在当前分类中筛选工具 |
| 会话标签 | Json 工具、正则测试、Markdown 编辑预览和 Header 转换支持多个会话：点 <kbd>+</kbd> 新建，各会话独立输入；双击标签重命名，中键或 × 关闭 |
| <kbd>Ctrl</kbd> + <kbd>V</kbd> | 在图片、文件类工具中直接粘贴截图或复制的文件 |
| 拖放 | 图片和文件可以直接拖进窗口 |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | 在 JSON 编辑器中搜索 |
| 侧栏左下角按钮 | 收起侧栏，给工作区腾出空间 |
| 右上角 ☾ / ☀ | 切换深色 / 浅色主题 |
| 关闭窗口 | 点右上角 × 会缩小到任务栏右下角的托盘，单击托盘图标恢复；要退出请右键托盘图标选「退出」 |
| 拖动分隔线 | JSON 格式化的输入、结果之间的分隔线可以左右拖动，双击恢复 |

程序会记住你上次打开的分类和工具、主题、各工具的常用选项，下次打开直接继续使用。

## 隐私

- 除下面两个网络工具外，所有工具都在本地运行，**不会上传任何内容**。
- 会访问网络的地方只有以下几处：
  - **检查更新**：访问本仓库在 Gitee / GitHub 上的版本信息文件，不携带任何个人数据。
  - **IP 地址与位置查询**：打开这个工具或点击查询时，向免费的公共服务查询 IP 归属地（依次尝试 ip-api.com、ipwho.is、ipapi.co，会把要查询的 IP 发送给该服务；其中 ip-api.com 不支持加密传输）。
  - **Ping 网络测试**：只向你输入的地址发送 ping。
  - **下载 AI 抠图模型**：只有在「图片去背景」中点击下载时，从 rembg 项目的 GitHub 发布页下载模型文件；图片本身始终在本机处理。

## 技术栈

| 部分 | 选型 |
| --- | --- |
| 桌面框架 | Tauri 2（Rust + 系统 WebView2） |
| 界面 | Vue 3 · TypeScript · Vite |
| 代码编辑器 | CodeMirror 6 |
| 文档处理 | PDF.js · pdf-lib · docx · docx-preview · marked |
| 音频 | Web Audio · wasm-media-encoders（MP3 编码）· Windows 语音 |
| 视频 | Mediabunny（WebCodecs 硬件编解码） |
| AI 抠图 | ONNX Runtime Web · rembg 开源模型（U²-Net、IS-Net） |
| 图标 | Lucide |
| 测试 | Vitest |
| 打包与发布 | GitHub Actions · tauri-action |

## Star 趋势

如果这个工具对你有帮助，欢迎点个 Star ⭐，有问题或想要的新工具可以在 [Issues](https://github.com/Bulua/open-tools/issues) 中反馈。

<a href="https://star-history.com/#Bulua/open-tools&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Bulua/open-tools&type=Date&theme=dark" />
    <img alt="Star 历史趋势" src="https://api.star-history.com/svg?repos=Bulua/open-tools&type=Date" />
  </picture>
</a>

## 许可证

[MIT](LICENSE) © Bulua
