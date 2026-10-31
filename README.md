<div align="center">

<img src="app-icon.svg" width="96" height="96" alt="Open Tools" />

# Open Tools

**开发者工具百宝箱 · Windows 桌面应用**

JSON、编码、转换、图片处理等常用小工具，集中在一个轻量、离线、开箱即用的桌面程序里。

[![构建状态](https://github.com/Bulua/open-tools/actions/workflows/build.yml/badge.svg)](https://github.com/Bulua/open-tools/actions/workflows/build.yml)
[![最新版本](https://img.shields.io/github/v/release/Bulua/open-tools?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC)](https://github.com/Bulua/open-tools/releases/latest)
[![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%2010%20%2F%2011-c96442)](#下载与安装)
[![许可证](https://img.shields.io/github/license/Bulua/open-tools?label=%E8%AE%B8%E5%8F%AF%E8%AF%81)](LICENSE)

[下载](#下载与安装) · [功能](#功能一览) · [使用技巧](#使用技巧) · [参与开发](#参与开发)

</div>

---

## 简介

日常开发中经常需要格式化一段 JSON、解一个 Base64、换算时间戳、压缩几张图片……这些事情往往要打开不同的网站，还要担心数据被上传。

Open Tools 把这些常用工具放进一个桌面程序：

- **离线运行，数据不出本机**：所有处理都在你的电脑上完成，不联网、不上传。
- **轻量**：安装包只有几 MB，启动快，占用内存少。
- **一个窗口搞定**：顶部切换分类，左侧选择工具，`Ctrl K` 随时搜索。
- **切换不丢数据**：在不同工具之间来回切换，之前的输入和结果都会保留。
- **自动更新**：有新版本时程序内提示，一键更新。

## 功能一览

目前共 4 个分类、20 个工具。

### Json 工具

| 工具 | 说明 |
| --- | --- |
| JSON 格式化校验 | 美化、压缩、按键名排序；实时校验，错误定位到具体行；支持代码 / 树形两种视图，可折叠，可复制节点路径 |
| JSON 差异对比 | 对比两段 JSON，列出新增、删除、修改的字段及其路径 |
| JSON 字符串转义 | 还原日志里 `{\"a\":1}` 这类被转义的 JSON，或反向转义 |
| JSON 转 YAML / TS 类型 | JSON 与 YAML 互转；根据 JSON 示例生成 TypeScript 类型定义 |

### 编码 / 加密

| 工具 | 说明 |
| --- | --- |
| Base64 编解码 | 文本双向实时转换（支持 URL 安全写法）；任意文件 / 图片转 Base64，解码后自动识别文件类型并可下载 |
| URL/Unicode/HTML 编码 | URL 参数编码、中文与 `\uXXXX` 互转、HTML 特殊字符转义，双向实时转换 |
| 哈希计算（MD5 / SHA） | 一次算出 MD5、SHA-1、SHA-256、SHA-512，支持文本与文件 |
| JWT 解码 | 查看 Header、Payload，显示签发与过期时间，标出是否已过期 |

### 转换

| 工具 | 说明 |
| --- | --- |
| 时间戳转换 | 秒 / 毫秒时间戳与日期互转（自动识别单位），实时显示当前时间戳 |
| 进制转换 | 二、八、十、十六进制及 2～36 任意进制互转，支持超大整数 |
| 颜色转换 HEX/RGB/HSL | 任意写法互转，支持透明度，带取色器 |
| 命名风格转换 | 变量名一次转换为小驼峰、大驼峰、下划线、常量、短横线等 8 种写法 |

### 图片

| 工具 | 说明 |
| --- | --- |
| 图片压缩 / 格式转换 | 批量压缩，JPG / PNG / WebP 互转，限制最大尺寸；显示压缩前后对比，可打包下载 |
| 图片裁剪 / 旋转 / 调色 | 按比例裁剪、旋转、翻转、调整尺寸，调节亮度 / 对比度 / 饱和度，支持撤销 |
| 图片拼接 | 多张图片横向、纵向、按宫格拼接，或自由拖动摆放、缩放；可统一尺寸、设置间距和背景色 |
| 图片马赛克 | 框选或画笔涂抹，打上马赛克或模糊，遮挡人脸、车牌、手机号等，支持撤销 |
| 图片水印 | 文字或图片水印，九宫格定位或平铺，可调透明度和旋转；多张图片批量处理 |
| 图片去背景 | 自动识别背景色（支持多种颜色、渐变背景），变为透明或换成白、蓝、红等底色（适合产品图、Logo、证件照） |
| 图片取色 | 点击图片任意位置取色，自动提取主色调 |
| ICO 图标生成 | 由图片生成多尺寸 ICO 图标（网站 favicon、程序图标），也可导出各尺寸 PNG |

## 下载与安装

1. 打开 [Releases](https://github.com/Bulua/open-tools/releases/latest) 页面。
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
| 会话标签 | Json 工具支持多个会话：点 <kbd>+</kbd> 新建，各会话独立输入；双击标签重命名，中键或 × 关闭 |
| <kbd>Ctrl</kbd> + <kbd>V</kbd> | 在图片、文件类工具中直接粘贴截图或复制的文件 |
| 拖放 | 图片和文件可以直接拖进窗口 |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | 在 JSON 编辑器中搜索 |
| 侧栏左下角按钮 | 收起侧栏，给工作区腾出空间 |
| 右上角 ☾ / ☀ | 切换深色 / 浅色主题 |

程序会记住你上次打开的分类和工具、主题、各工具的常用选项，下次打开直接继续使用。

## 隐私

- 所有工具都在本地运行，**不会上传任何内容**。
- 唯一的网络请求是检查更新：访问本仓库在 GitHub 上的版本信息文件，不携带任何个人数据。

## 参与开发

基于 [Tauri 2](https://v2.tauri.app/) + [Vue 3](https://vuejs.org/) + TypeScript 构建。

```bash
git clone https://github.com/Bulua/open-tools.git
```

```bash
cd open-tools && npm install
```

```bash
npm run dev
```

浏览器打开 http://localhost:1420 即可开发界面；以桌面窗口运行需要先安装 [Rust](https://rustup.rs)，然后执行 `npm run tauri dev`。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 在浏览器中开发界面 |
| `npm run tauri dev` | 以桌面窗口运行（需要 Rust） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 运行单元测试 |
| `npm run tauri build` | 打包安装程序（需要 Rust） |

不想在本地安装 Rust，也可以直接推送代码，由 GitHub Actions 在云端打包。

更多说明：

- [开发指南](docs/DEVELOPMENT.md)：项目结构、如何新增工具和分类、代码约定
- [发布指南](docs/RELEASE.md)：发布新版本、在线更新与签名密钥

欢迎通过 [Issues](https://github.com/Bulua/open-tools/issues) 反馈问题或建议新工具。

## 技术栈

| 部分 | 选型 |
| --- | --- |
| 桌面框架 | Tauri 2（Rust + 系统 WebView2） |
| 界面 | Vue 3 · TypeScript · Vite |
| 代码编辑器 | CodeMirror 6 |
| 图标 | Lucide |
| 测试 | Vitest |
| 打包与发布 | GitHub Actions · tauri-action |

## 许可证

[MIT](LICENSE) © Bulua
