<div align="center">

<img src="app-icon.png" width="96" height="96" alt="Open Tools" />

# Open Tools

[English](README.md) | 简体中文 | [日本語](README.ja.md)

**开发者工具百宝箱 · Windows 桌面版与 Android 测试版**

JSON、编码、时间、图片、音视频和文档处理等常用小工具，集中在一个桌面程序里。大部分内容在本机处理，无需上传文件。

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

- **本地处理**：文件和内容主要在本机处理，需要联网的功能见下方[隐私说明](#隐私)。
- **开箱即用**：Windows 安装包附带 AI 运行库，AI 模型按需下载，图片推理在本机完成。
- **一个窗口搞定**：顶部切换分类，左侧选择工具，`Ctrl K` 随时搜索。
- **切换不丢数据**：在不同工具之间来回切换，之前的输入和结果都会保留。
- **首页**：集中查看收藏、最近使用的工具、使用统计和待办提醒。
- **自动更新**：有新版本时程序内提示，一键更新。
- **多语言**：界面支持简体中文、English 和日本語，默认跟随系统语言。

## 功能一览

目前共 9 个分类、70 个工具。

| 分类 | 包含 |
| --- | --- |
| 开发工具 | JSON 格式化与校验（代码 / 树形视图）、差异对比、字符串转义、转 YAML 和 TypeScript 类型，Base64、URL / Unicode / HTML 编码、哈希计算、JWT 解码、正则表达式测试、命名风格转换 |
| 日常工具 | 随机密码、密码本、剪贴板历史（Windows）、截图与贴图（Windows）、身份证号解析 |
| 时间 | 时间戳转换、时区转换与世界时间、Cron 表达式、时钟（闹钟与星期重复、秒表分段、多计时器）、日历（公历 / 农历、节日、备注与 Windows 桌面提醒） |
| 计算换算 | 计算器、单位换算、进制转换 |
| 图片 | 压缩、格式转换、裁剪、旋转、调色、拼接、马赛克、水印、去背景（AI 识别主体）、去水印（AI 修补）、图片取色、颜色转换、修改 DPI、ICO 图标生成 |
| 音频 | 压缩、格式转换（含视频提取声音）、剪辑、拼接、录音机、文字转语音 |
| 视频 | 视频压缩、B 站视频下载（支持本地播放）、抖音与小红书下载（自动识别视频或图集，按平台保存到 data/videos）、视频转音频（直接复制原始音轨或转 MP3、M4A、WAV）、视频转 GIF、视频裁剪（时长和画面）、视频拼接、视频配乐、屏幕录制、摄像头录制 |
| 文档与文件 | 大文本编辑（多标签、连续滚动）、Word 转 PDF、PDF 转 Word、Word 加水印与去水印、PDF 内容编辑（原文替换、添加文字、图片、签名和标注）、PDF 页面管理、PDF 去水印、Markdown 编辑预览与转 Word、文件压缩与解压 |
| 网络 | HTTP 请求、IP 地址与位置查询、Ping 测试、请求头转 JSON / cURL |

## 下载与安装

### Windows

1. 打开 [Releases](https://github.com/Bulua/open-tools/releases/latest) 页面（国内可用 [Gitee 镜像](https://gitee.com/bulua/open-tools/releases)）。
2. 下载 `Open Tools_x.x.x_x64-setup.exe`。
3. 双击安装，完成后从开始菜单或桌面快捷方式打开。

**系统要求**：Windows 10 / 11（64 位）和 WebView2。Word 转 PDF 的本地转换需要安装 Microsoft Word、WPS 或 LibreOffice；PDF 转 Word 也提供不依赖 Office 的内置方式。

> **首次运行提示「Windows 已保护你的电脑」？**
> 安装包目前没有代码签名。确认下载来源可信后，可点击「更多信息」→「仍要运行」。

#### Windows 更新

程序启动后会自动检查新版本。发现未跳过的新版本时会弹出更新对话框；也可以点击侧栏底部的「检查更新」或「新版本」入口，查看说明、下载并安装。更新源优先使用 Gitee，失败时尝试 GitHub。

### Android 测试版

ARM64 设备可从 [GitHub Releases](https://github.com/Bulua/open-tools/releases/latest) 下载 `OpenTools_<版本>_arm64-v8a.apk`，安装包使用调试签名。部分 Windows 工具暂未在 Android 开放。更新时请手动下载安装新版 APK。

## 使用技巧

| 操作 | 说明 |
| --- | --- |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | 打开全局搜索，按工具名或说明查找所有分类中的工具，回车直接打开 |
| 左侧搜索框 | 只在当前分类中筛选工具 |
| 工具收藏星标 | 将常用工具加入首页收藏，首页也会显示最近使用的工具 |
| 会话标签 | JSON 工具、正则测试、HTTP 请求、Markdown 编辑预览和 Header 转换支持多个会话：点 <kbd>+</kbd> 新建，各会话独立输入；双击标签重命名，中键或 × 关闭 |
| <kbd>Ctrl</kbd> + <kbd>V</kbd> | 在图片、文件类工具中直接粘贴截图或复制的文件 |
| 拖放 | 图片和文件可以直接拖进窗口 |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | 在 JSON 编辑器中搜索 |
| 侧栏左下角按钮 | 收起侧栏，给工作区腾出空间 |
| 右上角 ☾ / ☀ | 切换深色 / 浅色主题 |
| 右上角语言按钮 | 切换跟随系统 / 简体中文 / English / 日本語 |
| 关闭窗口 | 点右上角 × 会缩小到任务栏右下角的托盘，单击托盘图标恢复；要退出请右键托盘图标选「退出」 |
| 拖动分隔线 | JSON 格式化的输入、结果之间的分隔线可以左右拖动，双击恢复 |

程序启动后先显示首页，并记住各分类上次选择的工具、主题、界面语言及常用选项。闹钟和计时器会保存，程序关闭期间到期的任务在下次启动时提醒；秒表仅在本次程序运行期间保留，退出后不继续计时。

## 隐私

- 除需要访问网络的功能外，内容均在本机处理。
- 会访问网络的功能包括：
  - **检查更新**：访问本仓库在 Gitee / GitHub 上的版本信息文件，不携带任何个人数据。
  - **应用图标同步**：启动后及运行期间定时从 Gitee / GitHub 读取图标配置，必要时下载图标，不上传用户文件。
  - **IP 地址与位置查询**：打开这个工具或点击查询时，向免费的公共服务查询 IP 归属地（依次尝试 ip-api.com、ipwho.is、ipapi.co，会把要查询的 IP 发送给该服务；其中 ip-api.com 不支持加密传输）。
  - **HTTP 请求**：将配置的请求头、参数和请求体发送到你指定的服务器。
  - **Ping 网络测试**：只向你输入的地址发送 ping。
  - **视频下载**：解析和下载时访问对应的视频平台及其媒体服务器。小红书普通请求失败时，桌面版会在隐藏窗口中加载分享页；链接中的分享参数会发送给小红书。
  - **下载 AI 模型**：只有在「图片去背景」「图片去水印」中点击下载时，下载模型文件（AI 运行环境 ONNX Runtime 已随安装包带上），优先从国内的魔搭社区（ModelScope）下载，失败时换到 Hugging Face；图片本身始终在本机处理。
  - **Markdown 中的远程图片**：将引用 HTTP(S) 图片的 Markdown 导出为 Word 时，会访问对应 URL 下载图片。

## Star 趋势

如果这个工具对你有帮助，欢迎点个 Star ⭐，有问题或想要的新工具可以在 [Issues](https://github.com/Bulua/open-tools/issues) 中反馈。

<a href="https://star-history.com/#Bulua/open-tools&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Bulua/open-tools&type=Date&theme=dark" />
    <img alt="Star 历史趋势" src="https://api.star-history.com/svg?repos=Bulua/open-tools&type=Date" />
  </picture>
</a>

## 许可证

[AGPL-3.0](LICENSE) © Bulua
