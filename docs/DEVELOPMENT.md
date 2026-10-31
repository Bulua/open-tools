# 开发指南

本文介绍项目结构、如何新增工具和分类，以及代码约定。环境准备与常用命令见 [README](../README.md#参与开发)。

## 项目结构

```
open-tools/
├── .github/workflows/       # GitHub Actions：类型检查、测试、云端打包与发布
├── docs/                    # 开发与发布文档
├── public/                  # 原样复制的静态文件（网页图标）
├── src/                     # 前端代码，界面全部在这里
│   ├── main.ts              # 入口
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
│   │   │   ├── ToolView.vue        # 工具栏（名称、说明、选项）+ 工作区
│   │   │   ├── TextTransform.vue   # 「输入 → 按钮 → 输出」界面
│   │   │   ├── TwoWayConvert.vue   # 左右双向实时转换界面
│   │   │   └── toolActions.ts      # 工具栏右侧选项区的位置
│   │   └── common/          # 通用组件
│   │       ├── TextPane.vue        # 带标题栏的文本框；设置 language="json" 变成代码编辑器
│   │       ├── CodeEditor.vue      # CodeMirror 编辑器（行号、折叠、错误标记）
│   │       ├── CopyList.vue        # 多个结果 + 复制按钮
│   │       ├── FileDropZone.vue    # 文件拖放 / 选择 / 粘贴
│   │       ├── EmptyState.vue
│   │       └── CommandPalette.vue  # Ctrl+K 全局搜索
│   └── tools/               # 所有工具，一个分类一个文件夹
│       ├── index.ts         # 分类注册表（决定顶部分类及顺序）
│       ├── types.ts         # Tool / Category 类型定义
│       ├── json/
│       │   ├── index.ts         # 分类定义：包含哪些工具
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
│   ├── icons/               # 应用图标（由 app-icon.svg 生成）
│   └── src/                 # Rust 入口与插件注册
└── app-icon.svg             # 图标源文件
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

工具栏右侧可以放这个工具的选项（模式切换、复选框等），在组件里使用 `Teleport`：

```vue
<script setup lang="ts">
import { TOOL_ACTIONS } from "@/components/tool/toolActions";
</script>

<template>
  <Teleport defer :to="TOOL_ACTIONS">
    <label class="check"><input v-model="sort" type="checkbox" />按键名排序</label>
  </Teleport>
  <!-- 工具主体 -->
</template>
```

## 新增一个分类

1. 新建 `src/tools/<分类>/index.ts`，导出一个 `Category`（参考 `convert/index.ts`）。
2. 在 `src/tools/index.ts` 的 `categories` 数组里加上它，数组顺序就是顶部分类的顺序。

## 代码约定

- **命名**：工具名要一看就知道做什么，例如「JSON 差异对比」而不是「对比」；功能相近的工具合并成一个。
- **逻辑与界面分离**：处理数据的逻辑写成纯函数，放在分类目录下的 `utils.ts` 等文件，并在旁边的 `*.test.ts` 写测试。
- **复用界面组件**：优先使用 `TextPane`、`CopyList`、`FileDropZone`、`TwoWayConvert` 和 `controls.css` 中的样式，保持风格一致。
- **颜色只用变量**：使用 `theme.css` 中的 CSS 变量，深色模式会自动适配。
- **全局事件**：监听 `window` 事件（如粘贴）请用 `useWindowEvent`，工具切到后台时会自动暂停。
- **图标**：在 [lucide.dev/icons](https://lucide.dev/icons) 查找。
- **提交前**：运行 `npm run typecheck` 和 `npm test`，云端打包时也会执行这两步。

## 修改应用图标

编辑根目录的 `app-icon.svg`，然后重新生成各尺寸图标：

```bash
npx tauri icon app-icon.svg
```

同时把 `app-icon.svg` 复制到 `public/favicon.svg`，并同步更新 `src/components/layout/AppLogo.vue`。
