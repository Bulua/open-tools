# Open Tools 开发须知

给在这个仓库里工作的 AI 编程助手（以及新加入的开发者）看的要点。详细流程与专题入口见 [开发指南](docs/DEVELOPMENT.md) 和 [发布指南](docs/release/RELEASE.md)。

## 项目概况

- Open Tools 使用 Vue 3 + TypeScript + Vite 编写界面，由 Tauri 2 提供原生能力。项目仅面向 Windows，使用 WebView2，发布 NSIS 安装包并支持在线更新。
- 界面按 9 个分类组织工具。每个工具独立放在 `src/tools/<分类>/<工具ID>/`，工具定义在该目录的 `index.ts`，分类模块 `index.ts` 只聚合本分类工具，`src/tools/index.ts` 与这 9 个分类目录一一对应。
- 界面支持简体中文、English、日本語（vue-i18n），默认跟随系统语言。
- 自动更新：GitHub Releases 和 Gitee（`updater` 分支）各放一份 `latest.json`，程序优先读 Gitee。

## 常用命令

```bash
npm run dev        # 启动 Windows Tauri 开发窗口
npm run build:win  # 构建 Windows EXE 和 NSIS 安装包
npm run typecheck  # vue-tsc 类型检查
npm test           # vitest 单元测试
npm run build      # 前端构建
```

提交前必须 `npm run typecheck` 和 `npm test` 都通过，GitHub Actions 打包时也会跑这两步。

## 工作约定

- **语言**：代码注释、提交信息、文档都用中文。提交信息用 `feat(范围): 说明` / `fix(...)` / `chore: ...` 的格式，`feat` / `fix` / `perf` 会自动写进版本说明。
- **先问再做**：提交、推送、打标签、发版本之前都要先问用户。
- **界面效果由用户自己验证**：改完界面不要用浏览器面板去截图检查，告诉用户改了什么、在哪里看即可。
- **Rust 验证**：Windows 专用代码需要在 Windows 环境运行 `cargo test --locked --manifest-path src-tauri/Cargo.toml`，可由 GitHub Actions 验证。改 Rust 前先跟用户说明改法；Rust 改动尽量单独一个提交，编译出错时容易单独修。
- **换行符**：仓库统一 LF（见 `.gitattributes`），在 Windows 上编辑时不要引入 CRLF 差异。
- **数据和 AI 模型**：程序数据的位置统一用 `src-tauri/src/core/paths.rs`（Windows 上是安装目录下的 `data`）；结构化本地数据统一存放在 `data/open-tools.db`（由 `src-tauri/src/core/db/` 维护，雪花 ID 统一由 `core/id.rs` 生成，时间字符串统一使用 `YYYY-MM-DD HH:MM:SS` 本地时间格式）；AI 模型在 Rust 里推理。Windows 安装包附带运行库，模型按需下载。详见 [数据存放与 AI 模型](docs/development/STORAGE.md)。
- **前后端通信（API 与类型）**：
  - 前后端共享 DTO 类型统一写在 `src/types/<模块>/` 并在 `src/types/index.ts` 汇总导出。
  - 前端所有与 Rust 后端的 IPC 调用、流式 Channel 与事件订阅统一收口在 `src/api/<模块>/`（经由 `src/api/common/request.ts` 的 `executeGeneratedCommand` / `requestBackend` / `requestBackendStream` / `subscribeBackendEvent` 与 `unwrapApiResponse`），禁止在页面、组件或工具逻辑中直接调用 `@tauri-apps/api/core` 的 `invoke`、`Channel` 或 `@tauri-apps/api/event` 的 `listen`。
  - Rust 命令统一放在所属模块的 `commands.rs` 并返回 `ApiResult<T>`（`{ code, msg, data }`，见 `src-tauri/src/core/error.rs`）；大块二进制数据传输保留 `Result<Response, AppError>`（或不可失败的 `Response`）。
  - 修改带 `#[specta::specta]` 的 Rust 命令或 DTO 后，运行 `cargo run --locked --manifest-path src-tauri/Cargo.toml --bin export_bindings` 重新生成 `src/api/generated/ai.ts`（并保持 LF 换行）。
- **样式**：颜色只用 `src/styles/theme.css` 里的 CSS 变量（深色模式自动适配）；按钮、分段选择、复选框等用 `src/styles/controls.css` 里的公共类。

## 前端交互

- **表单布局**。按字段内容限制表单宽度，标签靠近控件。长表单让字段区独立滚动，滚动条贴面板边缘，主要操作保持可见并与控件列对齐。无字段时，提示和操作区整体居中。
- **控件与清空**。下拉框复用 `AppSelect`，可留空时可提供「未设置」选项。单行文本框有值时可显示内嵌清空图标，数字框和多行编辑器可直接删空，复选框使用自身的勾选交互。
- **校验与报错**。字段校验就近显示，空间足够时放控件右侧，窄屏时放下方。连接失败等运行错误用 `showError` 在顶部通知，卡片只保留简短状态。
- **模式与弹层动效**。表单与 JSON 等模式双向切换时用轻微位移和 `ease-out`，保持用户输入，避免回弹、闪烁、内容淡入淡出和文字缩放。可关闭的弹出面板从上方滑入并淡入，关闭时上移并淡出，点击外部可收起。复用 `src/styles/motion.css` 和 `src/utils/motion.ts` 中的动效，遵循系统「减少动态效果」设置。
- **编辑与输出换行**。JSON 输入可按宽度软换行。调试结果、日志和原始响应默认保留行边界，长行可横向滚动。

布局和交互示例见 [前端交互设计](docs/development/FRONTEND.md)。

## Rust 目录约定

- 与前端一样按领域和工具组织：`src-tauri/src/tools/<模块>/<工具ID>/`，工具 ID 中的短横线改为下划线，例如 `clipboard_history`。只为需要原生能力的工具建目录。
- `mod.rs` 只声明模块；工具命令放 `commands.rs`。专用脚本与工具放在一起，复杂工具再按状态、系统 API、存储等职责拆文件。
- 多工具共用的实现放领域模块 `shared/`；全应用基础能力放 `core/`（含 `core/db/` SQLite 基座、`core/error.rs` 统一响应体、`core/id.rs` 雪花 ID 等），`core/` 不依赖具体工具。统一命令注册仍在 `src-tauri/src/lib.rs`。
- 目录重构保持 IPC 命令名、参数、返回字段、事件名和数据文件位置稳定；Windows 专用模块继续使用 `#[cfg(windows)]` 限定。

## 多语言（改界面时必看）

界面上**不能写死任何中文或英文**，详细写法见 [多语言文案](docs/development/I18N.md)。要点：

- **中文是基准**：工具名称、说明写在工具目录的 `index.ts`；其他语言写在同目录 `locales.ts` 的 `tools.en`、`tools.ja`。
- **界面文字**：放在工具目录 `locales.ts` 的 `messages`，以模块名为最外层 key。`zh-CN` 和 `en` 必须完整、key 一一对应，`ja` 也已完整，新增文案时三种语言一起加。
- **公共文案**：顶栏、侧栏、对话框、公共控件的文字在 `src/locales/zh-CN.ts`、`en.ts`、`ja.ts`。
- **取文案**：组件里 `const { t } = useI18n()`；普通 `.ts` 里 `import { t } from "@/locales"`。不要在模板里用 `t` 作 `v-for` 的循环变量。
- **按 id 区分的数据**（单位、城市、字体、预设等）：中文留在数据里，其他语言写进 `Translations` 翻译表，用 `translationIn()` 取。
- **不要写死"非中文就是英文"**：日期、星期、相对时间用 `Intl` 加当前 `locale`。
- **vue-i18n 语法字符**：文案里的 `@ { } |` 要写成 `{'@'}` 这样，邮箱地址也一样。`npm test` 会逐条编译所有文案，写错会失败。
- **Rust 报错**：Rust 返回给前端的报错统一用英文，不做翻译；托盘菜单的文字由前端通过 `set_tray_text` 命令传给 Rust。
- **新增一种语言**：见 [新增一种语言](docs/development/I18N.md#新增一种语言)。

## 新增工具的检查清单

1. 创建 `src/tools/<模块>/<工具ID>/`，在其中的 `index.ts` 定义工具（中文名称、说明、图标、组件），从模块 `index.ts` 聚合，并把 id 加进 `src/tools/index.ts` 的某个分类。
2. 在工具目录 `locales.ts` 里补上 `tools.en` / `tools.ja` 的名称和说明，以及界面用到的 `messages`（三种语言）。
3. 工具页面、独有 TS 逻辑、数据、Worker 和测试放在同一工具目录，子组件放该工具的 `components/`。逻辑测试用 `*.test.ts`，组件测试用 `*.component.test.ts`。多个工具共用的代码放模块 `shared/`，全应用通用代码放公共目录；工具不得直接依赖其他工具的私有实现。
4. 多个工具共用页面时，各自提供独立 Vue 入口，在模块 `shared/components/` 复用底层页面。优先复用 `src/components/common/` 里的组件（`TextPane`、`FileDropZone`、`CopyList`、`AppSelect` 等）。
5. 需要多会话时在工具定义里加 `sessions: true`；工具栏选项用 `ToolActions`，监听 `window` 事件用 `useWindowEvent`。
   读取、处理、保存、网络等真正的错误用 `src/utils/errorToast.ts` 的 `showError(e)` 在窗口上方提示；输入格式不对这类即时提示留在输入框旁边。
6. 跑 `npm run typecheck` 和 `npm test`；测试会检查每个工具都在某个分类里，并且每种语言都写了名称和说明。

## 发版

版本号只在 `package.json` 里维护。流程见 `docs/release/RELEASE.md`：

1. 用 `npm version x.y.z --no-git-tag-version` 改版本号，提交 `chore: 发布 vx.y.z`。
2. 打带说明的标签：`git tag -a vx.y.z -F notes.txt`。说明可以用 `<!-- en -->`、`<!-- ja -->` 按语言分段，开头不加标记的部分是中文。
3. 推送 master 和标签。

新功能升第二位，修复升第三位。发版前务必先问用户版本号，版本号不能比当前版本低，否则已安装的用户收不到更新。
