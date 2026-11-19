# 开发指南

本文介绍项目结构、如何新增工具和分类，以及代码约定。发布流程见[发布指南](RELEASE.md)。

## 本地开发

使用 Node.js 22（与 CI 一致）。安装依赖后可在浏览器预览大多数工具。

```bash
npm ci
npm run dev
npm run typecheck
npm test
```

需要验证 Windows 原生能力时，在已配置 Rust、WebView2 和 Windows 构建工具的环境中运行 `npm run tauri dev`。Android ARM64 测试 APK 由 [Android 工作流](../.github/workflows/android.yml)构建，工作流会生成 `src-tauri/gen/android/`，该目录由构建流程维护。

面向 `master` 的 Pull Request 会运行 [PR 检查](../.github/workflows/check.yml)，包括前端类型检查、Vitest（含界面交互回归）、生产构建和 Windows Rust 测试。

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
├── src-tauri/               # Tauri 原生端（Rust），供 Windows 和 Android 共用
│   ├── tauri.conf.json      # 窗口、应用名、更新配置（版本号读取 package.json）
│   ├── tauri.release.conf.json  # 发布版本时额外启用的配置（生成更新文件）
│   ├── tauri.vcredist.conf.json # 云端打包时把 VC++ 运行库放进安装包（见「数据存放与 AI 模型」）
│   ├── capabilities/        # 前端可调用的系统能力（权限白名单）
│   ├── icons/               # 应用图标（由 app-icon.png 生成）
│   └── src/                 # Rust 入口与插件注册
│       ├── core/            # 全应用基础能力：路径、进程输出、脚本、托盘、图标
│       └── tools/           # 只为需要原生能力的工具建立目录
│           ├── audio/
│           │   └── tts/                 # commands.rs、tts.ps1
│           ├── document/
│           │   ├── word_to_pdf/         # Word/WPS 转 PDF 命令与脚本
│           │   ├── pdf_to_word/         # PDF 转 Word 命令与脚本
│           │   └── shared/              # Office 引擎检测与通用转换流程
│           ├── encode/
│           │   ├── password_vault/      # 密码本文件读写
│           │   └── clipboard_history/   # 命令协调、Windows API、加密存储
│           ├── image/
│           │   ├── screenshot_history/  # 截图命令、捕获、窗口、剪贴板、状态与存储
│           │   └── shared/              # AI 模型管理、ONNX 推理
│           ├── network/
│           │   ├── ping/                # 系统 Ping
│           │   ├── ip_lookup/           # 本机局域网 IP
│           │   └── mqtt_client/         # MQTT TCP/TLS 连接、订阅与发布
│           ├── utility/
│           │   ├── calendar/            # 日历备注与通知
│           │   └── clock/               # 时钟提醒读写
│           └── video/
│               ├── douyin_download/     # 抖音信息获取命令与页面脚本
│               ├── xiaohongshu_download/ # 小红书分享页读取命令与脚本
│               └── shared/              # HDR 状态管理与平台下载目录
├── branding/                # 远程图标：不发新版本也能换图标，历史图标都在这里
└── app-icon.png             # 图标源文件（1024×1024，四角透明）
```

### 工具目录边界

- 每个工具目录以工具 ID 命名，包含独立 `index.ts`、Vue 页面和 `locales.ts`。工具独有的 TS 逻辑、状态、数据、Worker、测试和子组件都归该目录，子组件多时再建 `components/`。
- 简单工具保持少量文件；复杂工具按职责拆分逻辑和组合函数，不要求为每个页面机械创建 `useXxx.ts`。
- 抖音和小红书入口通过各自的 `adapter.ts` 为 `video/shared/components/SocialDownload.vue` 提供解析、下载和文件格式判断；共享页面不导入工具私有代码。下载目录、画质分组和预览缓存也统一放在 `video/shared/`。
- 多个工具共用的实现放模块 `shared/`；全站通用的组件、组合函数、函数分别放 `src/components/`、`src/composables/`、`src/utils/`。工具之间不直接依赖对方私有文件。
- 压缩与格式转换、屏幕与摄像头录制等工具各有独立 Vue 入口，通过固定参数复用 `shared/components/` 的页面，避免复制实现。
- 逻辑测试用 `*.test.ts`；组件测试用 `*.component.test.ts`，与被测文件放在一起，避免 Windows 下仅大小写不同的文件名冲突。
- 翻译加载器自动收集 `src/tools/*/*/locales.ts`，递归合并同一命名空间中的文案，原有 key 保持稳定。

### Rust 工具目录约定

- Rust 工具按 `src-tauri/src/tools/<模块>/<工具ID>/` 组织，与前端对应。模块名尽量一致；Rust 目录使用下划线，例如前端 `clipboard-history` 对应 Rust `clipboard_history`。
- 只有需要原生能力的工具才建立 Rust 目录。`mod.rs` 只声明模块；前端调用入口放 `commands.rs`。简单工具可将内部辅助逻辑保留在该文件，复杂工具再拆分职责。
- 专用 PowerShell / JavaScript 脚本与所属工具一起存放，通过同目录的 `include_str!` 嵌入。多个工具共用的能力放领域模块 `shared/`，全应用基础能力放 `core/`。
- 截图工具的 `commands.rs` 协调命令，`capture.rs` 负责 Windows 捕获，`clipboard.rs` 负责复制图片，`windows.rs` 管理截图层与贴图窗口，`state.rs` 管理草稿与并发状态，`store.rs` 管理历史文件，`types.rs` 定义序列化数据。
- `core/` 不依赖具体工具的实现。托盘的工具动作由 `lib.rs` 注入回调；外部进程输出解码在 `core/process.rs`，供脚本执行和 Ping 共用；数据路径继续统一使用 `core/paths.rs`。
- 插件初始化和 IPC 命令注册仍在 `src-tauri/src/lib.rs`。调整内部模块路径时保留命令名、参数、返回字段和事件名，避免影响前端及权限配置。
- Windows 专用模块在领域入口用 `#[cfg(windows)]` 限定，平台判断按原有行为保留。完整原生验证在 Windows 上执行 `cargo test --locked --manifest-path src-tauri/Cargo.toml`；Linux 检查需要额外安装 GTK/WebKit 等开发依赖。

## 新增一个工具

工具定义放在 `src/tools/<模块>/<工具ID>/index.ts`，模块 `index.ts` 只负责导入并汇总工具，界面分类由 `src/tools/index.ts` 统一注册。工具默认在所有平台显示。需要限制时，在工具定义上声明 `platforms`，可选值为 `desktop`（当前桌面发行版为 Windows）、`android`、`web`（浏览器开发预览）。目前 Android 尚未适配的工具使用 `platforms: ["desktop", "web"]`，保留原有浏览器预览入口。

工具界面有两种写法。

### 简单的文本转换

「输入 → 点按钮 → 输出」可复用 `src/components/tool/TextTransform.vue`。工具目录仍需提供独立 Vue 入口（参考 `src/tools/json/json-escape/`），函数写在该工具的 TS 文件中，`actions` 保留按钮元数据和转换函数：

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

在工具目录中写 Vue 页面（如 `src/tools/json/json-diff/JsonDiff.vue`），然后在同目录的 `index.ts` 定义工具：

```ts
{
  id: "json-diff",
  name: "JSON 差异对比",
  desc: "对比两段 JSON，列出新增、删除和修改的字段",
  icon: GitCompare,
  component: defineAsyncComponent(() => import("./JsonDiff.vue")),
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

MQTT连接支持独立会话，每个会话可选择 MQTT 3.1.1 或 5.0，已有配置默认使用 3.1.1。两个版本通过 Rust `rumqttc` 连接 TCP 或 TLS 服务器；浏览器仅预览界面，Android 暂不显示该工具。TLS 使用系统可信证书并校验服务器名称。连接超时默认 10 秒，协议确认超时为 15 秒，可在新建会话的高级配置中开启自动重连。订阅等待 SUBACK，取消订阅等待 UNSUBACK，QoS 1/2 发布分别等待 PUBACK/PUBCOMP；QoS 0 不保证服务器收到。每条发送内容最多 256 KiB，记录同时受最近 200 条和 4 MiB 原始载荷限制；发送区和消息列表均支持 Plaintext、Base64、JSON 和 Hex。Plaintext 与 JSON 按原文发送 UTF-8 字节，Base64 与 Hex 忽略空白后解码为字节发送，输入非法时禁用发送并提示；256 KiB 上限按实际发送字节计算。发送格式切换只改变输入的解释方式，不改写草稿。收发记录保留原始字节，发送记录保存发送时的格式与输入原文，后续切换发送或接收格式都不会改写已有发送记录；列表顶部的「接收格式」只作用于接收消息，发送区单独标为「发送格式」。Base64 与 Hex 可无损查看二进制，Plaintext 按 UTF-8 显示，JSON 尝试格式化，非 JSON 保留文本；非 UTF-8 消息显示二进制标记。右侧默认采用单页布局：顶部连接参数采用两行网格，MQTT 版本位于第二行，清除会话位于第二行最右侧，窄窗口自动调整列数。状态左侧的编辑按钮在断开连接时可用，复用添加连接的常规、高级和遗嘱配置页，保存更新当前连接，取消丢弃修改；下方订阅区与消息区通过可拖拽分隔线调宽。新增订阅通过订阅栏标题右侧的「＋ 订阅」按钮打开弹框。消息区以收发消息气泡显示主题、QoS、正文、时间、字节数与格式，不再提供点击展开的详情面板。消息正文支持直接选中文字复制，鼠标按下或键盘聚焦消息时暂停自动滚动，新消息不打断阅读；可勾选「自动滚动」恢复跟随。发送区常驻底部，发送按钮位于消息输入框内右下角。发送主题采用较短的可输入下拉框，候选来自当前连接的预设订阅和现有发送记录，去重并排除含通配符的主题，支持输入筛选、方向键选择及直接输入新主题；切换连接关闭菜单且不混用候选。顶部输入框限制为合适宽度，发送参数选择器使用深层选择器限定公共 AppSelect 的宽度。点击订阅主题可按 MQTT 主题过滤器筛选当前会话已有的收发记录，支持 +、# 与系统主题匹配规则；点击「全部订阅」恢复完整列表，筛选不会删除消息或拉取服务器历史，页面本身不纵向滚动；消息、订阅列表及编辑器在各自区域内滚动。左侧为文件夹与会话目录，顶部仅保留新建文件夹和会话按钮；项目右键菜单仅提供重命名和删除，移动与排序只通过拖拽完成，空白处右键菜单在根目录新建。目录支持折叠和拖拽排序，与右侧工作区共用外框；分隔线可拖拽或用方向键调宽，记住宽度，双击恢复默认。目录结构及每个会话的连接参数、预设订阅与发送草稿自动保存，旧的命名配置和未保存草稿迁入目录。右侧显示选中会话的独立单页工作区，不再使用工具公共标签栏。密码和收发消息记录不持久化。重新打开时不自动连接，用户手动连接成功后恢复预设订阅，活动状态以服务器确认结果为准。切换会话保留连接和消息，删除会话或包含它的文件夹时释放连接；删除非空文件夹先确认。取消「清除会话」时，服务器可能恢复此客户端 ID 以前的订阅；工具无法枚举服务器保存的订阅列表。

在工具定义里加上 `sessions: true`，工作区上方就会出现会话标签栏，同一个工具可以开多个标签，各自独立输入和处理：

```ts
{ id: "json-format", name: "JSON 格式化", ..., sessions: true },
```

每个会话是工具组件的一个独立实例，工具组件本身不需要改动。注意两点：

- 工具栏选项请用 `ToolActions`，它只显示当前会话的选项。
- 监听 `window` 事件请用 `useWindowEvent`，它只把事件交给当前会话。
- 需要判断自己是否是当前会话时，用 `useToolActive()`。

## 分类与排序

工具代码按 `src/tools/<模块>/<工具ID>/` 组织，目录名与工具 ID 一致，顶部显示的分类则按用途在 `src/tools/index.ts` 的 `categories` 中用工具 id 挑选，两者可以不同（例如「时间」分类包含来自 `convert/` 和 `utility/` 的工具）。

- 新增工具：在工具目录的 `index.ts` 定义，从模块 `index.ts` 聚合，再把 id 加到 `categories` 的某个分类中。测试会检查每个工具都恰好出现在一个分类里。
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
| 工具名称、说明、输入框提示、按钮名 | 工具目录的 `index.ts`（工具定义本身） | 同目录 `locales.ts` 的 `tools.en`、`tools.ja`… |
| 工具界面里的文字 | 工具目录 `locales.ts` 的 `messages["zh-CN"]` | 工具目录 `locales.ts` 的 `messages.en`、`messages.ja`… |
| 单位、城市、字体等按 id 区分的数据 | 数据本身 | 按语言分的翻译表，例如 `src/tools/convert/units/names.ts` |

### 新增工具时

1. 在工具目录的 `index.ts` 里用中文写 `name`、`desc`（以及 `inputPlaceholder`、`actions` 的 `label`）。
2. 在同一工具目录 `locales.ts` 的 `tools` 里按语言、再按工具 id 写翻译。`actions` 按顺序一一对应。**英文必须写**，其他语言能写就写，没写的显示英文：

```ts
// src/tools/json/json-escape/locales.ts
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

写在工具目录 `locales.ts` 的 `messages` 里；多个工具共用的文字写在模块 `shared/locales.ts`。仍然**以模块名为最外层的 key**，避免与其他模块重名。

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
- **按 id 区分的数据**（例如单位、城市、字体、常用预设）：中文留在数据里，其他语言写进 `Translations` 类型的翻译表。用 `translationIn(表, locale, id)` 取，没有时自动回退到英文再到中文。参考 `src/tools/convert/units/names.ts`。
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
   - 在每个工具及共享目录的 `locales.ts` 的 `tools` 里加上这种语言的工具名称和说明。测试要求这两项完整。
4. **工具界面**：在工具及共享目录的 `locales.ts` 的 `messages` 里加上这种语言的翻译。可以逐个工具添加，没加的显示英文。
5. **数据翻译表**（可选）：单位、城市、字体、Cron 和正则的常用预设等，在对应的翻译表里加上这种语言，没加的显示英文。
6. **按语法生成的句子**（可选）：Cron 表达式的说明是按语法拼出来的，每种语言要单独写一个生成函数，登记在 `src/tools/utility/cron/cron.ts` 的 `DESCRIBERS` 里；没写的用英文说明。
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

PDF 内容编辑与 PDF 页面管理的工具 ID、目录分别为 `pdf-content-editor`、`pdf-page-manager`；历史 ID 通过 `src/tools/toolId.ts` 映射，保留收藏、最近使用和分类选择。页面管理支持点击独立选中或取消单页，Shift 追加连续范围，复选框与页面点击保持一致。

## Word 转 Markdown

「Word 转 Markdown」位于 `src/tools/document/word-to-markdown/`，原生实现位于 `src-tauri/src/tools/document/word_to_markdown/`。仅支持 `.docx`，无需安装 Office 或其他转换组件。前端使用二进制 IPC 上传单个 Word 文件，Rust 直接读取 DOCX 的 ZIP/XML，生成主目录中的同名 `.md` 和 `assets/` 图片，再返回内部 ZIP。界面只解压 Markdown 供查看；没有导出图片时直接保存原始 `.md` 字节，有图片时保存包含 Markdown 与 `assets/` 的 ZIP，不上传服务器。图片判断以实际导出的资源为准，表格和原生公式本身不会触发 ZIP 导出。

第一版支持标题、段落、直接或继承的粗体/斜体、删除线、列表、链接、图片、表格及常见 OMML 公式。简单表格输出 Markdown，合并单元格和嵌套表格输出 HTML，保留 `colspan` / `rowspan`；原生公式输出 `$...$` / `$$...$$` LaTeX。图表、SmartArt、文本框、旧公式嵌入对象及无法识别的公式静默跳过，不显示兼容性提示。批注、页眉页脚不导出，修订取接受后的正文。外链图片不下载；损坏、加密文件、转换和保存失败仍走统一错误提示。输入上限 64 MB，解压总量上限 128 MB。

不支持旧 `.doc`，不进行 DOC 到 DOCX 转换，也不下载或调用 LibreOffice。Android 暂不展示此工具。

职责划分：前端 `WordToMarkdown.vue` 负责交互，`conversion.ts` 负责二进制 IPC、结果解析及 MD/ZIP 格式选择；Rust `commands.rs` 负责命令校验，`converter/package.rs` 负责 DOCX 包和元数据读取，`converter.rs` 负责正文及图片转换，`converter/table.rs` 负责表格，`math.rs` 负责公式，`xml.rs` 负责 XML 公共操作。图片按 SHA-256 去重，避免逐张比较所有已提取图片的内容。

回归测试以实际 ZIP/XML 结构覆盖图片引用、去重、合并表格、公式、多语言文本、列表、修订、路径边界及文件大小限制。新增工具后若 Vitest 文件系统模块缓存仍使用旧的 `import.meta.glob` 清单，先运行 `npm test -- --clearCache`，再正常运行 `npm test`。

## PDF 内容编辑

「PDF 内容编辑」的页面、逻辑、Worker 和测试统一放在 `src/tools/document/pdf-content-editor/`，工具定义与三语言文案分别在同目录的 `index.ts`、`locales.ts`，PDF 读取与渲染复用 `document/shared/`。支持替换可定位的横排原文，以及叠加文字、图片、手写签名、高亮和图形。`pdfEditor.ts` 保存以 PDF.js 可见页面为基准的坐标，导出时先生成透明叠加页，再根据旋转和 CropBox 转换回原页坐标，保留原文件的文字、图片与矢量内容。新增文字使用 `@pdf-lib/fontkit` 嵌入字形子集，仍可搜索；其他新增对象写入页面内容，导出后不保留编辑器的独立对象状态。手写签名是图形，不是数字证书签名。

编辑器按职责组织：`PdfEditor.vue` 协调编辑流程与交互；`pdfEditorModel.ts` 定义编辑数据、快照、撤销重做及共用几何；`pdfEditor.ts` 专注 PDF 导出；`usePdfEditorFonts.ts` 负责字体匹配、注册和释放；`usePdfPagePreview.ts` 负责页面位图、解码切换、缩略图队列与 URL 回收。异步任务在文档切换后须丢弃旧结果，字体测宽与导出共用 `PDF_TEXT_FEATURES`。

Windows 版通过 `src-tauri/src/tools/document/pdf_content_editor/` 枚举系统已安装的轮廓字体（包括当前用户安装的字体），读取 name 表中的中英文及 PostScript 别名，按原文名称、粗体和斜体匹配。本机同款完整字体优先于 PDF 内嵌子集，字体下拉框也支持搜索并手动选择本机字体。列表在进程内缓存，字体内容按需读取；不接受前端提供文件路径。通过 GDI 按表读取并重建独立 sfnt，支持 TTC 集合中的字体，浏览器预览与导出共用同一份字节。读取时检查嵌入权限；不允许可编辑子集嵌入的字体会拒绝加载。未找到可用原字体时明确提示使用替代字体；输入缺字时保留当前选择并提示，导出会拒绝缺字，不自动整行切换字体。安装新字体后需重启应用刷新列表。

内置的 Noto Sans CJK 字体位于 `src/assets/fonts/`，随应用打包，支持中英日，无需联网载入。原始字体约 16 MB，来源和授权见同目录 README；授权副本还放在 `public/licenses/`，确保打包时随字体分发。编辑器也支持导入本机 TTF / OTF。导出前检查字体缺字和文本框溢出，不能静默截断文字。

原文定位与移除由 `pdfTextEngine.ts` 使用 MuPDF 在模块 Worker 中完成，WASM 随程序打包，不访问远程服务。旧文字先在副本中真实移除，再由 `pdfEditor.ts` 写入替换内容；移除前后比较剩余字符及其位置，不满足条件时拒绝导出。图片、底色和线条不参与删改。原文保留字体名、首行基线、行距、文字原点、字距和水平缩放；字号与水平缩放从 MuPDF 绘制设备的实际文字矩阵分别读取，不使用结构化文字中随水平压缩变化的面积字号。字形 advance 使用绘制时的 glyph ID，不能用 Unicode 反查 CID 子集字体的 glyph ID。输入框和导出使用相同的字距、缩放及原点偏移，并关闭浏览器的可选字偶距和连字，测宽按实际导出字体的 glyph advance 计算；优先匹配本机同款字体，其次提取 PDF 中可直接加载的 TrueType/OpenType 字体，子集缺字或原文字体无法复用时提示改用替代字体，不自动重排周围段落。点击原文只创建临时输入框，未实际修改时不移除或重画原文，也不生成撤销记录。扫描件的隐藏 OCR 文字层、竖排和旋转文字暂不支持直接编辑。打开文件和翻页时自动读取当前页，按同一文本块内相同字体的相邻行生成原文编辑框，输入时即时显示替换内容。MuPDF 授权随应用放在 `public/licenses/MuPDF-AGPL.txt`，ES 模块 Worker 需要 ES2022 的顶层 await 支持；开发模式通过 `optimizeDeps.exclude` 排除 MuPDF 的旧目标预打包，以免动态导入失败。

编辑区域使用连续页面布局，滚动同步当前页和缩略图的加粗强调色边框，并将当前缩略图保持在侧栏可视范围内，边框加粗时同步扣减内边距以保持尺寸稳定；屏幕附近的页面按需渲染并释放远处位图；缩放期间保留旧位图。右侧不显示对象属性；顶部为统一的两层工具栏，上层按文字编辑、素材与标注分组，撤销、缩放及导出靠右，下层只显示当前工具或选中对象适用的属性。字体标签不折行，不透明度显示百分比；顶部不显示说明、原文字体、加载状态或即时校验提示行，避免输入与选中时改变页面纵向位置；读取、处理和导出错误继续通过统一错误提示处理。工具选中高亮复用 `utils/motion.ts`，属性区通过裁剪和轻微位移展开，不做内容淡入淡出或文字缩放，并遵循系统减少动态效果设置。编辑器中的文字直接在页面上输入，默认不自动折行，只有显式回车换行；输入时根据字体度量向页面右侧扩宽文本框；粘贴和输入法组合期间根据输入框实际值同步扩宽 DOM 并在 Vue 更新后清除内部滚动，输入框内不显示滚动条。超出页边的内容仍保持单行编辑，并提示溢出、在导出时拒绝越界内容。浏览器显示与 PDF 导出使用相同的显式换行，不能在导出阶段再次按框宽拆行。双击新增文字可以继续编辑；输入失焦后作为一次操作记录，空白新增输入不生成对象。新增文字的按下事件必须阻止默认焦点转移，避免浏览器在输入框聚焦后触发失焦；文字工具保持启用，便于连续添加。文字容器空白处不拦截点击，选中的文字框通过上方独立手柄移动，避免移动与输入冲突。未改字的原文也可直接通过手柄移动或缩放；开始手势时失焦处理须保留临时对象，无实际移动或取消时不生成替换和撤销记录。原文移除与重绘期间保留旧页面位图，不显示整页遮罩；新位图解码后一起切换背景与替换文字层，避免闪白和叠字，之后再释放旧 URL。左侧栏支持拖动分隔条调整宽度，也可用方向键调整。签名模式不显示笔迹的选中框，切换选择模式后仍可调整笔迹。Ctrl + 滚轮以鼠标附近为中心缩放，异步重绘期间保留上一次页面图像。左侧读取 PDF 自带书签（含层级、命名目标及页对象目标），仅在确实存在目录时显示目录切换；导出时保留原书签。

箭头头部默认 24 pt，可在工具栏调整为 4～96 pt，独立于线宽保存，支持撤销重做。预览和导出复用同一套头部坐标；SVG 允许绘制超出线段包围框的两翼与圆头线帽，不能按对象视口裁切箭头。

新增编辑逻辑需要覆盖旋转、裁切页面的坐标测试，及中英日文字、图片、图形、撤销重做的回归测试。界面效果仍由用户自行检查，不使用浏览器截图验收。

## 数据存放与 AI 模型

- **数据文件夹**：程序自己保存的数据（密码本、倒计时、AI 模型与运行环境、远程图标）统一通过 `src-tauri/src/core/paths.rs` 的 `data_dir()` / `sub_dir()` 取位置，不要再直接用 `app_local_data_dir()` 或安装目录。Windows 上是安装目录下的 `data`，安装目录不能写时退回 `%LOCALAPPDATA%\com.opentools.app`；Android 使用系统提供的应用数据目录。旧版本的数据在启动时由 `paths::migrate()` 搬过来；倒计时以前存在 localStorage，由前端第一次读取时写进 `countdowns.json`（见 `clockStore.ts`）。界面设置仍由各平台的 WebView 存在 localStorage 里，不在这个文件夹。
- **视频平台下载**：B 站、抖音、小红书分别保存到数据目录下的 `videos/bilibili`、`videos/douyin`、`videos/xhs`。前端统一调用 `src/tools/video/shared/downloadStorage.ts`，原生端 `video_download_dir` 通过 `paths::sub_dir()` 创建目录，并只为对应平台目录开放文件写入和本地媒体播放权限。播放使用 Tauri asset 协议读取已保存文件，不把整段视频长期保留在内存中。抖音和小红书共用 `SocialDownload.vue`，自动判断视频或图集；B 站保留清晰度、编码、登录和多 P 选择。网页开发预览仍使用浏览器下载，预览 Blob 在作品移除时释放。
- **AI 推理在 Rust 里**：`src-tauri/src/tools/image/shared/inference.rs` 用 `ort` 动态加载 ONNX Runtime，只用 CPU 多线程计算（DirectML 显卡加速跑不了 LaMa 等模型，已不再使用）。前端只做预处理、后处理，通过 `ai_run` 命令传入输入张量（请求体，多个输入依次拼接）、形状（请求头 `x-shape`，多个输入用分号隔开）和数据类型（请求头 `x-dtype`，`f32` 或 `u8`），见 `src/tools/image/shared/aiModels.ts` 的 `runModel()`、`runModelRaw()`。网页版不支持 AI 功能。
- **运行环境随安装包带上，模型不打包**：`onnxruntime.dll`、`DirectML.dll` 直接提交在 `src-tauri/ai-runtime/`，由 `tauri.conf.json` 的 `bundle.resources` 装到安装目录的 `ai-runtime` 里，程序优先用这一份（`ai_models.rs` 的 `runtime_dir()`）；没有或文件大小对不上时，第一次下载模型时自动把运行环境下载到数据文件夹，作为兜底。模型由用户选择下载。可下载的文件、大小、SHA-256 写在 `src-tauri/src/tools/image/shared/ai_models.rs`，每个文件在魔搭（[sebponk/open-tools-models](https://www.modelscope.cn/models/sebponk/open-tools-models)）和 Hugging Face（[penghui002/open-tools-models](https://huggingface.co/penghui002/open-tools-models)）各放一份，路径相同。
- **新增模型或升级运行环境**：用 `scripts/prepare-ai-files.ps1` 下载、整理文件并输出大小和校验值，把文件上传到两个仓库（两个仓库的 README.md、LICENSE.md 在 `scripts/ai-files/`，脚本会一起放进去，新增文件时记得在里面补上来源和许可证），再把输出填进 `src-tauri/src/tools/image/shared/ai_models.rs`。升级 ONNX Runtime 时同时改 `RUNTIME_VERSION`、`Cargo.toml` 里 `ort` 的 `api-NN` 特性，并替换 `src-tauri/ai-runtime/` 里的文件。注意带 DirectML 的 ONNX Runtime 最后一个版本是 1.24.4，之后微软不再单独发布这个包。
- **VC++ 运行库随安装包带上**：`onnxruntime.dll` 依赖 `msvcp140.dll`、`msvcp140_1.dll`、`vcruntime140.dll`、`vcruntime140_1.dll`，没装过 VC++ 运行库的电脑会加载失败（主程序自己是静态链接的，不受影响）。GitHub Actions 打包前从 Visual Studio 的可再发行目录（`VC\Redist\MSVC\<版本>\x64\Microsoft.VC*.CRT`）取出这几个文件放到 `src-tauri/vcredist/`（不提交），再通过 `tauri.vcredist.conf.json` 装到安装目录、和 `open-tools.exe` 放在一起；Windows 给 `onnxruntime.dll` 找依赖时会先找程序所在的文件夹。本机打包要带上它们时，自己把文件放进 `src-tauri/vcredist/` 并加 `--config src-tauri/tauri.vcredist.conf.json`。升级 ONNX Runtime 后如果依赖的运行库文件变了，同时改 `build.yml` 里的文件列表和 `tauri.vcredist.conf.json`。

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
