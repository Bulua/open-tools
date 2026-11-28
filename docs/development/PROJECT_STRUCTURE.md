# 项目结构

```
open-tools/
├── .github/workflows/       # GitHub Actions：类型检查、测试、云端打包与发布
├── docs/                    # 开发与发布文档
├── public/                  # 原样复制的静态文件（界面图标）
├── scripts/                 # 发布脚本：同步版本到 Gitee
├── src/                     # 前端代码，界面全部在这里
│   ├── main.ts              # 入口
│   ├── ai/                  # AI 助手工作台页面、状态管理、附件与提示词预设
│   ├── api/                 # 统一后端 IPC 接口层（按模块拆分，经 common/request.ts 收口）
│   │   ├── common/          # 请求封装、错误归一化与响应解包
│   │   ├── generated/       # tauri-specta 自动生成的强类型命令绑定
│   │   └── <模块>/          # 各模块后端命令与事件订阅封装
│   ├── types/               # 全应用共享的前后端 DTO 与领域类型（按模块拆分并统一导出）
│   ├── locales/             # 多语言：vue-i18n 初始化、各语言的公共文案（zh-CN.ts、en.ts、ja.ts）、工具列表的翻译
│   ├── App.vue              # 整体布局：顶栏 + 侧栏 + 工具区；记住上次打开的工具
│   ├── styles/
│   │   ├── theme.css        # 颜色、字体等设计变量（改主题只改这里）
│   │   ├── base.css         # 全局基础样式
│   │   └── controls.css     # 共用控件：按钮 .btn、分段选择 .seg、复选框 .check、输入框 .field、面板 .card
│   ├── utils/               # 与界面无关的通用函数
│   │   ├── saveFile.ts      # 通过「另存为」保存文件、多文件打包 ZIP
│   │   ├── time.ts          # 时间格式化、相对时间
│   │   ├── color.ts         # 颜色解析与 HEX / RGB / HSL 格式化
│   │   └── format.ts        # 文件大小等显示格式
│   ├── composables/         # 可复用的组合式逻辑
│   │   ├── useStoredRef.ts  # 自动保存到 localStorage 的状态
│   │   ├── useTheme.ts      # 浅色 / 深色主题
│   │   ├── useClipboard.ts  # 复制、粘贴
│   │   ├── useWindowEvent.ts# 只在工具显示时生效的全局事件（如粘贴）
│   │   └── useUpdater.ts    # 在线更新
│   ├── components/
│   │   ├── layout/          # 外框：AppHeader 顶栏、AppSidebar 侧栏、AppLogo、UpdateDialog 更新对话框
│   │   ├── tool/            # 工具区与通用工具界面
│   │   │   ├── ToolView.vue        # 工具栏（名称、说明、选项）+ 会话标签栏 + 工作区
│   │   │   ├── ToolSession.vue     # 工具主体的一个实例（一个会话）
│   │   │   ├── SessionTabs.vue     # 会话标签栏：新建、切换、关闭、重命名
│   │   │   ├── ToolActions.vue     # 把选项放进工具栏右侧
│   │   │   ├── TextTransform.vue   # 「输入 → 按钮 → 输出」界面
│   │   │   ├── TwoWayConvert.vue   # 左右双向实时转换界面
│   │   │   └── toolActions.ts      # 工具栏选项区位置、当前会话标记
│   │   └── common/          # 通用组件
│   │       ├── TextPane.vue        # 带标题栏的文本框；设置 language="json" 变成代码编辑器
│   │       ├── CodeEditor.vue      # CodeMirror 编辑器（行号、折叠、错误标记）
│   │       ├── CopyList.vue        # 多个结果 + 复制按钮
│   │       ├── FileDropZone.vue    # 文件拖放 / 选择 / 粘贴
│   │       ├── EmptyState.vue
│   │       └── CommandPalette.vue  # Ctrl+K 全局搜索
│   └── tools/               # 模块 / 工具 ID 两级目录
│       ├── index.ts         # 汇总工具，按用途配置展示分类
│       ├── types.ts         # Tool / Category 类型定义
│       ├── json/
│       │   ├── index.ts     # 只聚合本模块工具
│       │   ├── json-diff/
│       │   │   ├── index.ts       # 工具注册，默认导出 Tool
│       │   │   ├── JsonDiff.vue   # 工具页面
│       │   │   ├── diff.ts        # 工具独有逻辑
│       │   │   ├── diff.test.ts   # 逻辑测试
│       │   │   └── locales.ts     # 本工具的中英日文案
│       │   ├── json-format/
│       │   │   ├── index.ts
│       │   │   ├── JsonFormat.vue
│       │   │   ├── locales.ts
│       │   │   └── components/    # 仅该工具使用的子组件
│       │   └── shared/            # 多个 JSON 工具复用的解析、格式化和文案
│       ├── encode/
│       ├── convert/
│       └── image/
│           └── screenshot-history/ # 截图工具的逻辑、测试、页面与多窗口子组件
├── src-tauri/               # Tauri 原生端（Rust），Windows 原生能力
│   ├── tauri.conf.json      # 窗口、应用名、更新配置（版本号读取 package.json）
│   ├── tauri.release.conf.json  # 发布版本时额外启用的配置（生成更新文件）
│   ├── tauri.vcredist.conf.json # 云端打包时把 VC++ 运行库放进安装包
│   ├── capabilities/        # 前端可调用的系统能力（权限白名单）
│   ├── icons/               # 应用图标（由 app-icon.png 生成）
│   └── src/                 # Rust 入口与插件注册
│       ├── core/            # 全应用基础能力：db（SQLite）、error（统一 ApiResult）、id（雪花 ID）、路径、进程输出、脚本、托盘、图标、通知
│       └── tools/           # 只为需要原生能力的工具建立目录
│           ├── ai/                      # AI 工作台命令、多模型流式引擎、工具注册表与 SQLite 存储
│           ├── audio/
│           │   └── tts/                 # commands.rs、tts.ps1
│           ├── document/
│           │   ├── large_file/          # 大文件分块读写、编码与稀疏行索引
│           │   ├── pdf_content_editor/  # 系统字体枚举与 sfnt 重建
│           │   ├── pdf_to_word/         # PDF 转 Word 命令与脚本
│           │   ├── shared/              # Office 引擎检测与通用转换流程
│           │   ├── word_to_markdown/    # DOCX 解析、表格/公式/图片转换
│           │   └── word_to_pdf/         # Office 转 PDF 命令与脚本
│           ├── encode/
│           │   ├── clipboard_history/   # 命令协调、Windows API、SQLite 存储
│           │   ├── id_card/             # 身份证解析历史加密存储
│           │   └── password_vault/      # 密码本文件读写
│           ├── image/
│           │   ├── screenshot_history/  # 截图命令、捕获、窗口、剪贴板、状态与存储
│           │   └── shared/              # AI 模型管理、ONNX 推理
│           ├── markdown/
│           │   └── notebook/            # 笔记本索引、正文与资源文件读写
│           ├── network/
│           │   ├── http_client/         # HTTP 请求发送与请求历史存储
│           │   ├── ip_lookup/           # 本机局域网 IP
│           │   ├── mcp_inspector/       # MCP 会话管理、stdio/HTTP 连接与配置存储
│           │   ├── mqtt_client/         # MQTT TCP/TLS、WebSocket 连接、订阅与工作区存储
│           │   └── ping/                # 系统 Ping
│           ├── utility/
│           │   ├── calculator/          # 计算器历史存储与内置 AI 工具
│           │   ├── calendar/            # 日历备注与通知
│           │   └── clock/               # 时钟提醒读写与内置 AI 工具
│           └── video/
│               ├── bilibili_download/   # B 站设置与 SESSDATA 加密存储
│               ├── douyin_download/     # 抖音信息获取命令与页面脚本
│               ├── shared/              # HDR 状态管理与平台下载目录
│               └── xiaohongshu_download/ # 小红书分享页读取命令与脚本
├── branding/                # 远程图标：不发新版本也能换图标，历史图标都在这里
└── app-icon.png             # 图标源文件（1024×1024，四角透明）
```

## 工具目录边界

- 每个工具目录以工具 ID 命名，包含独立 `index.ts`、Vue 页面和 `locales.ts`。工具独有的 TS 逻辑、状态、数据、Worker、测试和子组件都归该目录，子组件多时再建 `components/`。
- 简单工具保持少量文件；复杂工具按职责拆分逻辑和组合函数，不要求为每个页面机械创建 `useXxx.ts`。
- 抖音、小红书和 X 的下载入口通过各自的适配器为 `video/shared/components/SocialDownload.vue` 提供解析、下载和文件格式判断；共享页面不导入工具私有代码。下载目录、画质分组和预览缓存也统一放在 `video/shared/`。
- 多个工具共用的实现放模块 `shared/`；全应用通用的组件、组合函数、函数分别放 `src/components/`、`src/composables/`、`src/utils/`。工具之间不直接依赖对方私有文件。
- 压缩与格式转换、屏幕与摄像头录制等工具各有独立 Vue 入口，通过固定参数复用 `shared/components/` 的页面，避免复制实现。
- 逻辑测试用 `*.test.ts`；组件测试用 `*.component.test.ts`，与被测文件放在一起，避免 Windows 下仅大小写不同的文件名冲突。
- **接口与类型边界**：前后端共享类型统一放在 `src/types/<模块>/`；前端所有 `invoke`、`Channel`、`listen` 调用统一收口在 `src/api/<模块>/`，通过 `src/api/common/request.ts` 处理桌面运行时检查、响应解包和错误归一化，工具页面与组件不再直调 Tauri IPC。
- 翻译加载器自动收集 `src/tools/*/*/locales.ts`，递归合并同一命名空间中的文案，原有 key 保持稳定。

## Rust 工具目录约定

- Rust 工具按 `src-tauri/src/tools/<模块>/<工具ID>/` 组织，与前端对应。模块名尽量一致；Rust 目录使用下划线，例如前端 `clipboard-history` 对应 Rust `clipboard_history`。
- 只有需要原生能力的工具才建立 Rust 目录。`mod.rs` 只声明模块；前端调用入口放 `commands.rs`，JSON 命令统一返回 `ApiResult<T>`（`{ code, msg, data }`），二进制流式传输保留 `Result<Response, AppError>`（或 `Response`）。简单工具可将内部辅助逻辑保留在该文件，复杂工具再拆分职责。
- 专用 PowerShell / JavaScript 脚本与所属工具一起存放，通过同目录的 `include_str!` 嵌入。多个工具共用的能力放领域模块 `shared/`，全应用基础能力放 `core/`。
- 截图工具的 `commands.rs` 协调命令，`capture.rs` 负责 Windows 捕获，`clipboard.rs` 负责复制图片，`windows.rs` 管理截图层与贴图窗口，`state.rs` 管理草稿与并发状态，`store.rs` 管理历史文件，`types.rs` 定义序列化数据。
- `core/` 不依赖具体工具的实现。托盘的工具动作由 `lib.rs` 注入回调；外部进程输出解码在 `core/process.rs`，供脚本执行和 Ping 共用；数据路径继续统一使用 `core/paths.rs`。
- 插件初始化和 IPC 命令注册仍在 `src-tauri/src/lib.rs`。调整内部模块路径时保留命令名、参数、返回字段和事件名，避免影响前端及权限配置。
- Windows 专用模块在领域入口用 `#[cfg(windows)]` 限定，平台判断按原有行为保留。完整原生验证在 Windows 上执行 `cargo test --locked --manifest-path src-tauri/Cargo.toml`。


[返回开发指南](../DEVELOPMENT.md)
