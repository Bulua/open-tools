# 开发指南

本文介绍项目结构、如何新增工具和分类，以及代码约定。环境准备与常用命令见 [README](../README.md#参与开发)。

## 项目结构

```
open-tools/
├── .github/workflows/       # GitHub Actions：类型检查、测试、云端打包与发布
├── docs/                    # 开发与发布文档
├── public/                  # 原样复制的静态文件（网页图标）
├── scripts/                 # 发布脚本：同步版本到 Gitee
├── src/                     # 前端代码，界面全部在这里
│   ├── main.ts              # 入口
│   ├── locales/             # 多语言：vue-i18n 初始化、各语言的公共文案（zh-CN.ts、en.ts、ja.ts）、工具列表的翻译
│   ├── App.vue              # 整体布局：顶栏 + 侧栏 + 工具区；记住上次打开的工具
│   ├── styles/
│   │   ├── theme.css        # 颜色、字体等设计变量（改主题只改这里）
│   │   ├── base.css         # 全局基础样式
│   │   └── controls.css     # 共用控件：按钮 .btn、分段选择 .seg、复选框 .check、输入框 .field、面板 .card
│   ├── utils/               # 与界面无关的通用函数
│   │   ├── saveFile.ts      # 保存文件（桌面版弹出「另存为」，浏览器中直接下载）、多文件打包 ZIP
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
│   └── tools/               # 所有工具，按模块分文件夹
│       ├── index.ts         # 分类注册表：顶部有哪些分类、每个分类包含哪些工具
│       ├── types.ts         # Tool / Category 类型定义
│       ├── json/
│       │   ├── index.ts         # 本模块的工具定义
│       │   ├── locales.ts       # 本模块的多语言文案（工具名称的英文、界面文案）
│       │   ├── utils.ts         # 纯逻辑（解析、对比、生成类型…）
│       │   ├── utils.test.ts    # 单元测试
│       │   └── components/      # 需要自定义界面的工具
│       ├── encode/
│       ├── convert/
│       └── image/
├── src-tauri/               # 桌面端（Rust），一般不需要改
│   ├── tauri.conf.json      # 窗口、应用名、更新配置（版本号读取 package.json）
│   ├── tauri.release.conf.json  # 发布版本时额外启用的配置（生成更新文件）
│   ├── capabilities/        # 前端可调用的系统能力（权限白名单）
│   ├── icons/               # 应用图标（由 app-icon.png 生成）
│   └── src/                 # Rust 入口与插件注册
│       ├── core/            # 数据路径、脚本执行、托盘与应用图标
│       └── tools/           # 需要 Rust 能力的工具，按领域分类
│           ├── audio/       # 语音合成与脚本
│           ├── document/    # Office/PDF 转换与脚本
│           ├── image/       # AI 模型下载与推理
│           ├── network/     # Ping、本机 IP
│           ├── text/        # 密码本
│           ├── time/        # 倒计时
│           └── video/       # 抖音获取、录屏 HDR
├── branding/                # 远程图标：不发新版本也能换图标，历史图标都在这里
└── app-icon.png             # 图标源文件（1024×1024，四角透明）
```

## 新增一个工具

工具定义在 `src/tools/<分类>/index.ts` 中，有两种写法。

### 简单的文本转换

「输入 → 点按钮 → 输出」，只写函数，不用写界面：

```ts
{
  id: "reverse",
  name: "文本反转",
  desc: "把文本倒过来",
  icon: Repeat, // 从 lucide-vue-next 引入
  actions: [
    { label: "反转", primary: true, run: (s) => [...s].reverse().join("") },
  ],
},
```

### 自定义界面

在分类的 `components/` 下写一个 Vue 组件，然后：

```ts
{
  id: "json-diff",
  name: "JSON 差异对比",
  desc: "对比两段 JSON，列出新增、删除和修改的字段",
  icon: GitCompare,
  component: defineAsyncComponent(() => import("./components/JsonDiff.vue")),
},
```

只写 `id`、`name`、`desc`、`icon` 的工具会显示为「即将上线」。

### 把选项放到工具栏

工具栏右侧可以放这个工具的选项（模式切换、复选框等），在组件里使用 `ToolActions`：

```vue
<script setup lang="ts">
import ToolActions from "@/components/tool/ToolActions.vue";
</script>

<template>
  <ToolActions>
    <label class="check"><input v-model="sort" type="checkbox" />按键名排序</label>
  </ToolActions>
  <!-- 工具主体 -->
</template>
```

### 多会话

在工具定义里加上 `sessions: true`，工作区上方就会出现会话标签栏，同一个工具可以开多个标签，各自独立输入和处理：

```ts
{ id: "json-format", name: "JSON 格式化", ..., sessions: true },
```

每个会话是工具组件的一个独立实例，工具组件本身不需要改动。注意两点：

- 工具栏选项请用 `ToolActions`，它只显示当前会话的选项。
- 监听 `window` 事件请用 `useWindowEvent`，它只把事件交给当前会话。
- 需要判断自己是否是当前会话时，用 `useToolActive()`。

## 分类与排序

工具代码按模块放在 `src/tools/<模块>/` 下，顶部显示的分类则按用途在 `src/tools/index.ts` 的 `categories` 中用工具 id 挑选，两者可以不同（例如「时间」分类包含来自 `convert/` 和 `utility/` 的工具）。

- 新增工具：在模块的 `index.ts` 里定义，再把 id 加到 `categories` 的某个分类中。测试会检查每个工具都恰好出现在一个分类里。
- 新增分类：在 `categories` 数组里加一项，数组顺序就是顶部分类的顺序。
- 分类内的工具自动按名称排序（中文按拼音、英文按字母，按首字母混排），定义时的顺序不影响显示。英文界面下按英文名的字母排序。
- 新增分类时，在 `src/locales/tools.ts` 的 `CATEGORY_NAMES` 里写上分类在各语言的名称。

## 多语言文案

界面支持简体中文、英文和日语，基于 [vue-i18n](https://vue-i18n.intlify.dev/)。语言默认跟随系统，用户可以在顶栏的语言按钮里切换，选择会被记住。

- **中文是基准**：中文直接写在代码和数据里，其他语言都是它的翻译。
- **缺的翻译会回退**：英文缺的显示中文；其他语言缺的先用英文，英文也没有再显示中文。所以只翻译了一部分也能正常使用。目前日语已全部翻译，只有 Cron 表达式的说明和 Markdown 编辑器的示例文档还用英文。
- **Rust 返回的报错统一用英文**，不跟着界面语言切换。托盘菜单的文字由前端按当前语言传给 Rust（`set_tray_text` 命令），以后加语言不用改 Rust。

文案放在这些地方：

| 文案 | 中文写在 | 其他语言写在 |
|---|---|---|
| 顶栏、侧栏、更新对话框、托盘菜单、公共控件 | `src/locales/zh-CN.ts` | `src/locales/en.ts`、`ja.ts`…（每种语言一个文件） |
| 分类名 | `src/tools/index.ts` 的 `categories` | `src/locales/tools.ts` 的 `CATEGORY_NAMES` |
| 工具名称、说明、输入框提示、按钮名 | 模块的 `index.ts`（工具定义本身） | 模块 `locales.ts` 的 `tools.en`、`tools.ja`… |
| 工具界面里的文字 | 模块 `locales.ts` 的 `messages["zh-CN"]` | 模块 `locales.ts` 的 `messages.en`、`messages.ja`… |
| 单位、城市、字体等按 id 区分的数据 | 数据本身 | 按语言分的翻译表，例如 `src/tools/convert/names.ts` |

### 新增工具时

1. 照常在模块的 `index.ts` 里用中文写 `name`、`desc`（以及 `inputPlaceholder`、`actions` 的 `label`）。
2. 在同一模块 `locales.ts` 的 `tools` 里按语言、再按工具 id 写翻译。`actions` 按顺序一一对应。**英文必须写**，其他语言能写就写，没写的显示英文：

```ts
// src/tools/json/locales.ts
import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  tools: {
    en: {
      "json-escape": {
        name: "JSON String Escape",
        desc: "Restore escaped JSON from logs, or escape it the other way",
        placeholder: 'e.g. {\\"name\\":\\"Open Tools\\"}', // 对应 inputPlaceholder
        actions: ["Unescape", "Escape"], // 对应 actions 的 label
      },
    },
    ja: {
      "json-escape": { name: "JSON 文字列エスケープ", desc: "…", placeholder: "…", actions: ["アンエスケープ", "エスケープ"] },
    },
  },
});
```

测试会检查每种语言都写了所有工具的名称和说明，按钮数量、有没有输入框提示也要与工具定义一致。

### 工具界面里的文字

写在模块 `locales.ts` 的 `messages` 里，**以模块名为最外层的 key**，避免与其他模块重名。

- 英文必须与中文的 key 完全相同：少写、多写时 `npm run typecheck` 会报错，测试也会检查。
- 其他语言可以整块不写，但只要写了这个模块，结构也要与中文相同。缺的部分会回退到英文。

```ts
export default defineModuleLocales({
  tools: { ... },
  messages: {
    "zh-CN": { json: { sortKeys: "按键名排序", errorAt: "第 {line} 行有错误" } },
    en: { json: { sortKeys: "Sort keys", errorAt: "Error on line {line}" } },
    ja: { json: { sortKeys: "キーで並べ替え", errorAt: "{line} 行目にエラー" } },
  },
});
```

组件里用 `useI18n()` 取文案：

```vue
<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
</script>

<template>
  <label class="check"><input v-model="sort" type="checkbox" />{{ t("json.sortKeys") }}</label>
  <p :title="t('json.errorAt', { line: 3 })">…</p>
</template>
```

普通 `.ts` 文件（如逻辑函数里抛出的错误信息）用 `import { t } from "@/locales"`。测试在中文下运行，测试里断言的中文文案不用改。

注意：

- **变量用 `{name}` 插值**，不要把句子拆成几段再拼接，各语言的语序常常不同。
- 文案里要显示 `{`、`}`、`@`、`|` 这几个字符时，写成 `{'{'}`、`{'}'}`、`{'@'}`、`{'|'}`（它们是 vue-i18n 的语法字符）。邮箱里的 `@` 也要这样写。测试会逐条编译所有语言的文案，写错时 `npm test` 会失败。
- **按 id 区分的数据**（例如单位、城市、字体、常用预设）：中文留在数据里，其他语言写进 `Translations` 类型的翻译表。用 `translationIn(表, locale, id)` 取，没有时自动回退到英文再到中文。参考 `src/tools/convert/names.ts`。
- **不要写死"非中文就是英文"**：需要区分语言时查表，或者用 `Intl`（日期、星期、相对时间、数字）并传入当前语言（`import { locale } from "@/locales"`），参考 `utils/time.ts` 的 `relativeTime`。只有中文有特殊写法时，可以写 `locale.value === "zh-CN" ? 中文写法 : 通用写法`。
- 句子中间要加粗等带标签的内容时，用 `<Translation keypath="…">` 组件和具名插槽，参考 `UpdateDialog.vue`。
- 组件模板的 `v-for` 不要用 `t` 作循环变量，会遮住 `t()` 函数。
- 需要跟着语言变化的数组（例如星期），用 `tm()` 取出后再用 `rt()` 逐项转换，参考 `DateTimePicker.vue`。

### 新增一种语言

以下以日语（`ja`）为例：

1. **登记语言**：
   - 在 `src/locales/types.ts` 的 `Locale` 里加上语言代码。
   - 在 `src/locales/index.ts` 的 `LOCALES` 里加一项，名称用这种语言自己的写法（如「日本語」）。
   - 在同一文件的 `COMMON` 里引入下一步新建的公共文案文件。
2. **公共文案**：复制 `src/locales/en.ts` 为 `ja.ts` 并翻译。它的类型是 `Messages<typeof zhCN>`，必须完整。
3. **工具列表**：
   - 在 `src/locales/tools.ts` 的 `CATEGORY_NAMES` 里加上这种语言的分类名。
   - 在每个模块 `locales.ts` 的 `tools` 里加上这种语言的工具名称和说明。测试要求这两项完整。
4. **工具界面**：在模块 `locales.ts` 的 `messages` 里加上这种语言的翻译。可以一个模块一个模块地加，没加的显示英文。
5. **数据翻译表**（可选）：单位、城市、字体、Cron 和正则的常用预设等，在对应的翻译表里加上这种语言，没加的显示英文。
6. **按语法生成的句子**（可选）：Cron 表达式的说明是按语法拼出来的，每种语言要单独写一个生成函数，登记在 `src/tools/utility/cron.ts` 的 `DESCRIBERS` 里；没写的用英文说明。
7. **检查**：运行 `npm run typecheck` 和 `npm test`。它们会检查工具列表是否齐全、有没有多余的 key、所有文案能否正常编译。

系统语言会自动匹配：例如系统是 `ja-JP` 时，先找完全相同的 `ja-JP`，没有再按语种找 `ja`，都没有时用英文。

## 代码约定

- **命名**：工具名要一看就知道做什么，例如「JSON 差异对比」而不是「对比」；功能相近的工具合并成一个。
- **逻辑与界面分离**：处理数据的逻辑写成纯函数，放在分类目录下的 `utils.ts` 等文件，并在旁边的 `*.test.ts` 写测试。
- **复用界面组件**：优先使用 `TextPane`、`CopyList`、`FileDropZone`、`TwoWayConvert` 和 `controls.css` 中的样式，保持风格一致。
- **颜色只用变量**：使用 `theme.css` 中的 CSS 变量，深色模式会自动适配。
- **全局事件**：监听 `window` 事件（如粘贴）请用 `useWindowEvent`，工具切到后台时会自动暂停。
- **图标**：在 [lucide.dev/icons](https://lucide.dev/icons) 查找。
- **提交前**：运行 `npm run typecheck` 和 `npm test`，云端打包时也会执行这两步。

## 数据存放与 AI 模型

- **数据文件夹**：程序自己保存的数据（密码本、倒计时、AI 模型与运行环境、远程图标）统一通过 `src-tauri/src/core/paths.rs` 的 `data_dir()` / `sub_dir()` 取位置，不要再直接用 `app_local_data_dir()` 或安装目录。Windows 上是安装目录下的 `data`，安装目录不能写时退回 `%LOCALAPPDATA%\com.opentools.app`；以后支持手机时只改这一个函数。旧版本的数据在启动时由 `paths::migrate()` 搬过来；倒计时以前存在 localStorage，由前端第一次读取时写进 `countdowns.json`（见 `countdownStore.ts`）。界面设置仍由 WebView2 存在 localStorage 里，不在这个文件夹。
- **AI 推理在 Rust 里**：`src-tauri/src/tools/image/inference.rs` 用 `ort` 动态加载 ONNX Runtime，只用 CPU 多线程计算（DirectML 显卡加速跑不了 LaMa 等模型，已不再使用）。前端只做预处理、后处理，通过 `ai_run` 命令传入输入张量（请求体，多个输入依次拼接）、形状（请求头 `x-shape`，多个输入用分号隔开）和数据类型（请求头 `x-dtype`，`f32` 或 `u8`），见 `src/tools/image/aiModels.ts` 的 `runModel()`、`runModelRaw()`。网页版不支持 AI 功能。
- **模型和运行环境都不打包**：用户选择下载，第一次下载模型时自动带上运行环境。可下载的文件、大小、SHA-256 写在 `src-tauri/src/tools/image/ai_models.rs`，每个文件在魔搭（[sebponk/open-tools-models](https://www.modelscope.cn/models/sebponk/open-tools-models)）和 Hugging Face（[penghui002/open-tools-models](https://huggingface.co/penghui002/open-tools-models)）各放一份，路径相同。
- **新增模型或升级运行环境**：用 `scripts/prepare-ai-files.ps1` 下载、整理文件并输出大小和校验值，把文件上传到两个仓库（两个仓库的 README.md、LICENSE.md 在 `scripts/ai-files/`，脚本会一起放进去，新增文件时记得在里面补上来源和许可证），再把输出填进 `src-tauri/src/tools/image/ai_models.rs`。升级 ONNX Runtime 时同时改 `RUNTIME_VERSION` 和 `Cargo.toml` 里 `ort` 的 `api-NN` 特性。注意带 DirectML 的 ONNX Runtime 最后一个版本是 1.24.4，之后微软不再单独发布这个包。

## 修改应用图标

有两种方式：

- **不发新版本，远程换图标**：用 `scripts/branding.mjs` 加入或切换图标，推送 master 后用户自动换上。
  所有用过的图标都保留在 `branding/icons`，随时可以换回去。详见 [branding/README.md](../branding/README.md)。
- **随新版本更换程序自带的图标**：替换根目录的 `app-icon.png`（正方形、四角透明），然后重新生成各尺寸图标：

  ```bash
  npx tauri icon app-icon.png
  ```

  同时更新顶栏 Logo（`src/assets/app-logo.png`，96×96）和网页图标（`public/favicon.png`，64×64）。
  `.exe`、安装包的图标只能这样换。
