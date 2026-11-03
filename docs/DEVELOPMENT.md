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
│   ├── locales/             # 多语言：vue-i18n 初始化、公共文案（zh-CN.ts / en.ts）、工具列表的翻译
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
- 新增分类时，在 `src/locales/tools.ts` 的 `CATEGORY_NAMES_EN` 里写上分类的英文名。

## 多语言文案

界面支持简体中文和英文，基于 [vue-i18n](https://vue-i18n.intlify.dev/)。语言默认跟随系统，用户可以在顶栏的语言按钮里切换，选择会被记住。
找不到英文文案时显示中文，所以还没改成多语言的界面照常显示中文，不会报错。

文案放在三个地方：

| 文案 | 中文写在 | 英文写在 |
|---|---|---|
| 顶栏、侧栏、更新对话框、公共控件 | `src/locales/zh-CN.ts` | `src/locales/en.ts` |
| 工具名称、说明、输入框提示、按钮名 | 模块的 `index.ts`（工具定义本身） | 模块的 `locales.ts` 的 `tools` |
| 工具界面里的文字 | 模块的 `locales.ts` 的 `messages["zh-CN"]` | 模块的 `locales.ts` 的 `messages.en` |

### 新增工具时

1. 照常在模块的 `index.ts` 里用中文写 `name`、`desc`（以及 `inputPlaceholder`、`actions` 的 `label`）。
2. 在同一模块的 `locales.ts` 的 `tools` 里按工具 id 写英文。`actions` 按顺序一一对应：

```ts
// src/tools/json/locales.ts
import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  tools: {
    "json-escape": {
      name: "JSON String Escape",
      desc: "Restore escaped JSON from logs, or escape it the other way",
      placeholder: 'e.g. {\\"name\\":\\"Open Tools\\"}', // 对应 inputPlaceholder
      actions: ["Unescape", "Escape"], // 对应 actions 的 label
    },
  },
});
```

测试会检查每个工具都有英文名称和说明，按钮数量、有没有输入框提示也要与工具定义一致。

### 工具界面里的文字

写在模块 `locales.ts` 的 `messages` 里，**以模块名为最外层的 key**，避免与其他模块重名。中文和英文结构必须相同，少写、多写 key 时 `npm run typecheck` 会报错：

```ts
export default defineModuleLocales({
  tools: { ... },
  messages: {
    "zh-CN": { json: { sortKeys: "按键名排序", errorAt: "第 {line} 行有错误" } },
    en: { json: { sortKeys: "Sort keys", errorAt: "Error on line {line}" } },
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

- **变量用 `{name}` 插值**，不要把句子拆成几段再拼接，英文的语序常常和中文不同。
- 文案里要显示 `{`、`}`、`@`、`|` 这几个字符时，写成 `{'{'}`、`{'}'}`、`{'@'}`、`{'|'}`（它们是 vue-i18n 的语法字符）。
- 句子中间要加粗等带标签的内容时，用 `<Translation keypath="…">` 组件和具名插槽，参考 `UpdateDialog.vue`。
- 组件模板的 `v-for` 不要用 `t` 作循环变量，会遮住 `t()` 函数。
- 需要跟着语言变化的数组（例如星期），用 `tm()` 取出后再用 `rt()` 逐项转换，参考 `DateTimePicker.vue`。
- 日期、数字的格式可以直接用 `Intl` 并传入 `locale`（`import { locale } from "@/locales"`），参考 `utils/time.ts` 的 `relativeTime`。

## 代码约定

- **命名**：工具名要一看就知道做什么，例如「JSON 差异对比」而不是「对比」；功能相近的工具合并成一个。
- **逻辑与界面分离**：处理数据的逻辑写成纯函数，放在分类目录下的 `utils.ts` 等文件，并在旁边的 `*.test.ts` 写测试。
- **复用界面组件**：优先使用 `TextPane`、`CopyList`、`FileDropZone`、`TwoWayConvert` 和 `controls.css` 中的样式，保持风格一致。
- **颜色只用变量**：使用 `theme.css` 中的 CSS 变量，深色模式会自动适配。
- **全局事件**：监听 `window` 事件（如粘贴）请用 `useWindowEvent`，工具切到后台时会自动暂停。
- **图标**：在 [lucide.dev/icons](https://lucide.dev/icons) 查找。
- **提交前**：运行 `npm run typecheck` 和 `npm test`，云端打包时也会执行这两步。

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
