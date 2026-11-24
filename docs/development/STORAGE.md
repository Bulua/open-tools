# 数据存放与 AI 模型

## 应用数据目录

应用通过 [core/paths.rs](../../src-tauri/src/core/paths.rs) 的 `data_dir()` 和 `sub_dir()` 统一定位文件。Windows 优先使用 EXE 所在目录下的 `data`，目录不可写时使用 `%LOCALAPPDATA%\com.opentools.app`。直接从调试或发布目录运行 EXE 也适用这套规则，清理构建目录前应先保留其中的用户数据。

启动时，`paths::migrate()` 会搬迁旧版密码本、模型和远程图标。目标已有同名文件时保留旧文件，避免覆盖现有数据。时钟在尚无 `countdowns.json` 时读取旧版 WebView2 的 `countdowns` 并写入文件。

| 数据 | 相对于应用数据目录的位置 | 保存方式 |
| --- | --- | --- |
| 密码本 | `vault.dat`、`vault.dat.bak` | 前端用主密码派生密钥并以 AES-256-GCM 加密，Rust 写入密文并保留上一版 |
| 笔记本 | `notebook/index.json`、`notebook/notes/` | JSON 索引、独立 Markdown 正文；图片存于正文同目录的 `assets/`，正文使用相对引用 |
| 剪贴板历史 | `clipboard/history.dat` | 文本、时间及采集设置由当前 Windows 用户的 DPAPI 加密 |
| 截图与贴图 | `screenshots/<日期>/<小时>/` | 每张截图保存为 PNG |
| 时钟 | `countdowns.json` | 闹钟、计时器和旧版提醒 |
| 日历 | `calendar-notes.json` | 按日期保存备注和提醒事项 |
| MCP 工具查看器 | `mcp-connections.dat` | 连接配置由当前 Windows 用户的 DPAPI 加密 |
| AI 工作台 | `ai/config.dat`、`ai/conversations/` | 模型提供商与 API Key 由当前 Windows 用户的 DPAPI 加密；会话索引与单条历史独立存为 JSON |
| B 站、抖音、小红书与 X 下载 | `videos/bilibili/`、`videos/douyin/`、`videos/xhs/`、`videos/x/` | 保存下载成品，播放器经 Tauri asset 协议读取 |
| AI 模型与补下载的运行库 | `models/`、`runtime/<版本>/` | 按需下载并校验的文件 |
| 远程图标 | `branding/` | 图标及当前图标记录 |
| 大文件编辑器 | `large-text/` | 临时编辑片段，正常关闭会话时清理 |

普通工具导出时由「另存为」对话框选择目标。视频下载工具使用 [downloadStorage.ts](../../src/tools/video/shared/downloadStorage.ts)，Rust 为对应平台目录开放写入与本地播放权限。

## WebView2 本地存储

WebView2 的 `localStorage` 保存主题、语言、收藏、最近使用、快捷键和工具参数。大部分键通过 [useStoredRef](../../src/composables/useStoredRef.ts) 自动以 JSON 写入。复制应用数据目录时，这部分数据仍留在原 WebView2 配置中。

| 工具 | 存储键和内容 |
| --- | --- |
| HTTP 请求 | `http.history` 保存最近 30 条去重后的请求快照，包括请求头、认证字段、文本和表单字段。上传的文件对象不写入历史 |
| MQTT 连接 | `mqtt.workspace.v2` 保存目录、连接参数、订阅配置和发布草稿。连接密码和收发日志只在运行期间使用 |
| 身份证号解析 | `idCard.history` 保存解析过的完整 18 位号码 |
| 计算器 | `calculator.history` 保存最近 50 条算式和结果 |
| B 站视频下载 | `bilibili.sessdata` 保存登录凭据，画质和编码使用独立设置键 |

HTTP 请求历史里的认证内容、B 站 SESSDATA 和身份证号码都以未加密的 JSON 值保存。剪贴板历史和 MCP 连接文件依赖当前 Windows 用户的 DPAPI，跨用户或设备复制文件时应考虑解密限制。

## AI 模型与运行库

- **AI 推理在 Rust 里**：`src-tauri/src/tools/image/shared/inference.rs` 用 `ort` 动态加载 ONNX Runtime，只用 CPU 多线程计算。前端只做预处理、后处理，通过 `ai_run` 命令传入输入张量（请求体，多个输入依次拼接）、形状（请求头 `x-shape`，多个输入用分号隔开）和数据类型（请求头 `x-dtype`，`f32` 或 `u8`），见 `src/tools/image/shared/aiModels.ts` 的 `runModel()`、`runModelRaw()`。
- **运行环境随安装包带上，模型不打包**：`onnxruntime.dll`、`DirectML.dll` 直接提交在 `src-tauri/ai-runtime/`，由 `tauri.conf.json` 的 `bundle.resources` 装到安装目录的 `ai-runtime` 里，程序优先用这一份（`ai_models.rs` 的 `runtime_dir()`）；没有或文件大小对不上时，第一次下载模型时自动把运行环境下载到数据文件夹，作为兜底。模型由用户选择下载。可下载的文件、大小、SHA-256 写在 `src-tauri/src/tools/image/shared/ai_models.rs`，每个文件在魔搭（[sebponk/open-tools-models](https://www.modelscope.cn/models/sebponk/open-tools-models)）和 Hugging Face（[penghui002/open-tools-models](https://huggingface.co/penghui002/open-tools-models)）各放一份，路径相同。
- **新增模型或升级运行环境**：用 `scripts/prepare-ai-files.ps1` 下载、整理文件并输出大小和校验值，把文件上传到两个仓库（两个仓库的 README.md、LICENSE.md 在 `scripts/ai-files/`，脚本会一起放进去，新增文件时记得在里面补上来源和许可证），再把输出填进 `src-tauri/src/tools/image/shared/ai_models.rs`。升级 ONNX Runtime 时同时改 `RUNTIME_VERSION`、`Cargo.toml` 里 `ort` 的 `api-NN` 特性，并替换 `src-tauri/ai-runtime/` 里的文件。当前随包版本见 `RUNTIME_VERSION`。
- **VC++ 运行库随安装包带上**：`onnxruntime.dll` 依赖 `msvcp140.dll`、`msvcp140_1.dll`、`vcruntime140.dll`、`vcruntime140_1.dll`，没装过 VC++ 运行库的电脑会加载失败（主程序自己是静态链接的，不受影响）。GitHub Actions 打包前从 Visual Studio 的可再发行目录（`VC\Redist\MSVC\<版本>\x64\Microsoft.VC*.CRT`）取出这几个文件放到 `src-tauri/vcredist/`（不提交），再通过 `tauri.vcredist.conf.json` 装到安装目录，与 `open-tools.exe` 放在一起；Windows 给 `onnxruntime.dll` 找依赖时会先找程序所在的文件夹。本机打包要带上它们时，自己把文件放进 `src-tauri/vcredist/` 并执行 `npm run build:win -- --config src-tauri/tauri.vcredist.conf.json`。升级 ONNX Runtime 后如果依赖的运行库文件变了，同时改 `build.yml` 里的文件列表和 `tauri.vcredist.conf.json`。

[返回开发指南](../DEVELOPMENT.md)
