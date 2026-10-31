# Open Tools 工具百宝箱

一个 Windows 桌面工具箱，基于 [Tauri 2](https://v2.tauri.app/) + [Vue 3](https://vuejs.org/) + TypeScript。

顶部选择分类，左侧选择工具，右侧使用工具。按 `Ctrl K` 可以搜索所有工具。

## 下载

- **正式版本**：在仓库的 [Releases](https://github.com/Bulua/open-tools/releases) 页面下载 `*-setup.exe` 安装包。
- **最新构建**：在 [Actions](https://github.com/Bulua/open-tools/actions) 里打开最近一次成功的运行，从页面底部的 Artifacts 下载。

## 本地开发

```bash
npm install        # 安装依赖
npm run dev        # 在浏览器中开发界面：http://localhost:1420
npm run tauri dev  # 以桌面窗口运行（需要先安装 Rust）
```

| 命令                | 作用                                         |
| ------------------- | -------------------------------------------- |
| `npm run typecheck` | TypeScript 类型检查                          |
| `npm test`          | 运行单元测试                                 |
| `npm run build`     | 构建前端到 `dist/`                           |
| `npm run tauri build` | 打包 exe 与安装包（需要 Rust）             |

不想在本地安装 Rust 的话，推送代码后由 GitHub Actions 云端打包即可。

## 目录结构

```
open-tools/
├── .github/workflows/     # GitHub Actions：云端检查与打包
├── src/                   # 前端代码（界面全部在这里）
│   ├── main.ts            # 入口
│   ├── App.vue            # 整体布局：顶栏 + 侧栏 + 工具区，记住上次打开的工具
│   ├── styles/
│   │   ├── theme.css      # 颜色、字体等设计变量（改主题只改这里）
│   │   ├── base.css       # 全局基础样式
│   │   └── controls.css   # 共用控件：按钮 .btn、分段选择 .seg、复选框 .check
│   ├── utils/
│   │   ├── saveFile.ts    # 保存文件（桌面版弹出「另存为」，浏览器中直接下载）、多个文件打包 ZIP
│   │   ├── time.ts        # 时间格式化、相对时间
│   │   ├── color.ts       # 颜色解析与 HEX / RGB / HSL 格式化
│   │   └── format.ts      # 文件大小等显示格式
│   ├── composables/       # 可复用的逻辑
│   │   ├── useStoredRef.ts  # 自动保存到 localStorage 的状态
│   │   ├── useTheme.ts      # 浅色 / 深色主题
│   │   └── useClipboard.ts  # 复制、粘贴
│   ├── components/
│   │   ├── layout/        # 外框：AppHeader 顶栏、AppSidebar 侧栏
│   │   ├── tool/          # 工具区与通用工具界面：
│   │   │                  #   ToolView 工具区（标题栏右侧可放工具选项）
│   │   │                  #   TextTransform 「输入 → 按钮 → 输出」界面
│   │   │                  #   TwoWayConvert 左右双向实时转换界面（改哪边另一边自动更新）
│   │   └── common/        # 通用组件：TextPane 文本框（设置 language 后变成带行号/折叠的代码编辑器）、
│   │                      #   CopyList 多个结果 + 复制按钮、FileDropZone 文件拖放/选择/粘贴、
│   │                      #   CodeEditor、EmptyState、CommandPalette 搜索
│   └── tools/             # 所有工具，一个分类一个文件夹
│       ├── index.ts       # 分类注册表（决定顶部分类及顺序）
│       ├── types.ts       # Tool / Category 类型定义
│       ├── json/
│       │   ├── index.ts       # 分类定义：包含哪些工具
│       │   ├── utils.ts       # 纯逻辑（解析、对比、生成类型…）
│       │   ├── utils.test.ts  # 单元测试
│       │   └── components/    # 需要自定义界面的工具
│       ├── encode/
│       ├── convert/
│       └── image/
├── src-tauri/             # 桌面端（Rust），一般不需要改
│   ├── tauri.conf.json    # 窗口大小、应用名、版本号
│   ├── icons/             # 应用图标（由 app-icon.svg 生成）
│   └── src/               # Rust 入口
└── app-icon.svg           # 图标源文件
```

## 新增一个工具

工具定义在 `src/tools/<分类>/index.ts` 中，有两种写法。

**简单的文本转换**（输入 → 点按钮 → 输出）：只写函数，不用写界面。

```ts
// src/tools/encode/index.ts
{
  id: "reverse",
  name: "文本反转",
  desc: "把文本倒过来",
  icon: Repeat,                       // 从 lucide-vue-next 引入
  actions: [
    { label: "反转", primary: true, run: (s) => [...s].reverse().join("") },
  ],
},
```

**需要自定义界面的工具**：在 `components/` 下写一个 Vue 组件，然后：

```ts
{
  id: "json-diff",
  name: "JSON 对比",
  desc: "对比两段 JSON",
  icon: GitCompare,
  component: defineAsyncComponent(() => import("./components/JsonDiff.vue")),
},
```

只写 `id`、`name`、`desc`、`icon` 的工具会显示为「即将上线」。

约定：

- 处理数据的逻辑写成纯函数放在 `utils.ts` / `transforms.ts`，并在旁边的 `*.test.ts` 里写测试。
- 界面优先复用 `TextPane` 和 `controls.css` 里的样式，保持风格一致。
- 图标在 [lucide.dev/icons](https://lucide.dev/icons) 查找。

## 新增一个分类

1. 新建 `src/tools/<分类>/index.ts`，导出一个 `Category`（参考 `convert/index.ts`）。
2. 在 `src/tools/index.ts` 的 `categories` 数组里加上它。

## 发布新版本

1. 修改 `src-tauri/tauri.conf.json` 中的 `version`。
2. 提交后打标签并推送：

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

GitHub Actions 会自动打包并发布到 Releases。
