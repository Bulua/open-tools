# Open Tools 开发须知

给在这个仓库里工作的 AI 编程助手（以及新加入的开发者）看的要点。细节以 `docs/DEVELOPMENT.md`（开发）和 `docs/RELEASE.md`（发版）为准，这里只列最容易做错的地方。

## 项目概况

- Open Tools 使用 Vue 3 + TypeScript + Vite 编写界面，由 Tauri 2 提供原生能力。Windows 版使用 WebView2，发布 NSIS 安装包并支持在线更新。Android 版目前提供 ARM64 测试 APK，发布包见 GitHub Releases。
- 9 个分类、67 个工具。每个工具独立放在 `src/tools/<模块>/<工具ID>/`，工具定义在该目录的 `index.ts`，模块 `index.ts` 只聚合工具，分类在 `src/tools/index.ts` 的 `categories` 里按工具 id 挑选。
- 界面支持简体中文、English、日本語（vue-i18n），默认跟随系统语言。
- 自动更新：GitHub Releases 和 Gitee（`updater` 分支）各放一份 `latest.json`，程序优先读 Gitee。

## 常用命令

```bash
npm run dev        # 网页版开发（http://localhost:1420），大部分工具可以直接在浏览器里试
npm run typecheck  # vue-tsc 类型检查
npm test           # vitest 单元测试
npm run build      # 前端构建
```

提交前必须 `npm run typecheck` 和 `npm test` 都通过，GitHub Actions 打包时也会跑这两步。

## 工作约定

- **语言**：代码注释、提交信息、文档都用中文。提交信息用 `feat(范围): 说明` / `fix(...)` / `chore: ...` 的格式，`feat` / `fix` / `perf` 会自动写进版本说明。
- **先问再做**：提交、推送、打标签、发版本之前都要先问用户。
- **界面效果由用户自己验证**：改完界面不要用浏览器面板去截图检查，告诉用户改了什么、在哪里看即可。
- **本机没有 Rust 工具链**：`src-tauri/` 下的改动只能推送后靠 GitHub Actions 编译验证。改 Rust 前先跟用户说明改法；Rust 改动尽量单独一个提交，编译出错时容易单独修。
- **换行符**：仓库统一 LF（见 `.gitattributes`），在 Windows 上编辑时不要引入 CRLF 差异。
- **动效风格**：过渡要平滑（ease-out），不要回弹；内容不要淡入淡出或闪烁，不要拉伸文字。动效变量在 `src/styles/motion.css`，滑动高亮用 `src/utils/motion.ts`。
- **数据和 AI 模型**：程序数据的位置统一用 `src-tauri/src/core/paths.rs`（Windows 上是安装目录下的 `data`）；AI 模型在 Rust 里推理。Windows 安装包附带运行库，模型按需下载。详见 `docs/DEVELOPMENT.md`「数据存放与 AI 模型」。
- **样式**：颜色只用 `src/styles/theme.css` 里的 CSS 变量（深色模式自动适配）；按钮、分段选择、复选框等用 `src/styles/controls.css` 里的公共类。

## 多语言（改界面时必看）

界面上**不能写死任何中文或英文**，详细写法见 `docs/DEVELOPMENT.md`「多语言文案」。要点：

- **中文是基准**：工具名称、说明写在工具目录的 `index.ts`；其他语言写在同目录 `locales.ts` 的 `tools.en`、`tools.ja`。
- **界面文字**：放在工具目录 `locales.ts` 的 `messages`，以模块名为最外层 key。`zh-CN` 和 `en` 必须完整、key 一一对应，`ja` 也已完整，新增文案时三种语言一起加。
- **公共文案**：顶栏、侧栏、对话框、公共控件的文字在 `src/locales/zh-CN.ts`、`en.ts`、`ja.ts`。
- **取文案**：组件里 `const { t } = useI18n()`；普通 `.ts` 里 `import { t } from "@/locales"`。不要在模板里用 `t` 作 `v-for` 的循环变量。
- **按 id 区分的数据**（单位、城市、字体、预设等）：中文留在数据里，其他语言写进 `Translations` 翻译表，用 `translationIn()` 取。
- **不要写死"非中文就是英文"**：日期、星期、相对时间用 `Intl` 加当前 `locale`。
- **vue-i18n 语法字符**：文案里的 `@ { } |` 要写成 `{'@'}` 这样，邮箱地址也一样。`npm test` 会逐条编译所有文案，写错会失败。
- **Rust 报错**：Rust 返回给前端的报错统一用英文，不做翻译；托盘菜单的文字由前端通过 `set_tray_text` 命令传给 Rust。
- **新增一种语言**：按 `docs/DEVELOPMENT.md`「新增一种语言」的步骤做。

## 新增工具的检查清单

1. 创建 `src/tools/<模块>/<工具ID>/`，在其中的 `index.ts` 定义工具（中文名称、说明、图标、组件），从模块 `index.ts` 聚合，并把 id 加进 `src/tools/index.ts` 的某个分类。需要限制平台时，在同一工具定义里声明 `platforms`。
2. 在工具目录 `locales.ts` 里补上 `tools.en` / `tools.ja` 的名称和说明，以及界面用到的 `messages`（三种语言）。
3. 工具页面、独有 TS 逻辑、数据、Worker 和测试放在同一工具目录，子组件放该工具的 `components/`。逻辑测试用 `*.test.ts`，组件测试用 `*.component.test.ts`。多个工具共用的代码放模块 `shared/`，全站通用代码放公共目录；工具不得直接依赖其他工具的私有实现。
4. 多个工具共用页面时，各自提供独立 Vue 入口，在模块 `shared/components/` 复用底层页面。优先复用 `src/components/common/` 里的组件（`TextPane`、`FileDropZone`、`CopyList`、`AppSelect` 等）。
5. 需要多会话时在工具定义里加 `sessions: true`；工具栏选项用 `ToolActions`，监听 `window` 事件用 `useWindowEvent`。
   读取、处理、保存、网络等真正的错误用 `src/utils/errorToast.ts` 的 `showError(e)` 在窗口上方提示；输入格式不对这类即时提示留在输入框旁边。
6. 跑 `npm run typecheck` 和 `npm test`；测试会检查每个工具都在某个分类里，并且每种语言都写了名称和说明。

## 发版

版本号只在 `package.json` 里维护。流程见 `docs/RELEASE.md`：

1. 用 `npm version x.y.z --no-git-tag-version` 改版本号，提交 `chore: 发布 vx.y.z`。
2. 打带说明的标签：`git tag -a vx.y.z -F notes.txt`。说明可以用 `<!-- en -->`、`<!-- ja -->` 按语言分段，开头不加标记的部分是中文。
3. 推送 master 和标签。

新功能升第二位，修复升第三位。发版前务必先问用户版本号，版本号不能比当前版本低，否则已安装的用户收不到更新。
