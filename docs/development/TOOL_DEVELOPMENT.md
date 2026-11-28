# 新增与维护工具

目录与模块职责见 [项目结构](PROJECT_STRUCTURE.md)。

## 新增一个工具

工具定义放在 `src/tools/<分类>/<工具ID>/index.ts`，分类模块 `index.ts` 只负责导入并汇总工具，`src/tools/index.ts` 与界面 9 个分类保持一一对应。

工具界面有两种写法。

### 简单的文本转换

「输入 → 点按钮 → 输出」可复用 `src/components/tool/TextTransform.vue`。工具目录仍需提供独立 Vue 入口（参考 `src/tools/developer/json-escape/`），函数写在该工具的 TS 文件中，`actions` 保留按钮元数据和转换函数：

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

在工具目录中写 Vue 页面（如 `src/tools/developer/json-diff/JsonDiff.vue`），然后在同目录的 `index.ts` 定义工具：

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
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import ToolActions from "@/components/tool/ToolActions.vue";

const { t } = useI18n();
const sort = ref(false);
</script>

<template>
  <ToolActions>
    <label class="check"><input v-model="sort" type="checkbox" />{{ t("json.sortKeys") }}</label>
  </ToolActions>
  <!-- 工具主体 -->
</template>
```

### 多会话

在工具定义里加上 `sessions: true`，工作区上方就会出现会话标签栏，同一个工具可以开多个标签，各自独立输入和处理：

```ts
{ id: "json-format", name: "JSON 格式化", ..., sessions: true },
```

每个会话是工具组件的一个独立实例，工具组件本身不需要改动。通过以下入口处理会话之间的交互：

- 工具栏选项请用 `ToolActions`，它只显示当前会话的选项。
- 监听 `window` 事件请用 `useWindowEvent`，它只把事件交给当前会话。
- 需要判断自己是否是当前会话时，用 `useToolActive()`。

会话标签由 Vue 维护，退出应用后重新创建。工具可独立保存历史和偏好。使用自有会话目录的工具见 [MQTT 连接](../tools/MQTT.md)。

## 分类与排序

工具代码按 `src/tools/<分类>/<工具ID>/` 组织，与顶部分类在 `src/tools/index.ts` 中保持一一对应。

- 新增工具：在对应分类的工具目录 `index.ts` 定义，从该分类的 `index.ts` 聚合导出。测试会检查每个工具都恰好出现在一个分类里。
- 新增分类：新建 `src/tools/<分类ID>/index.ts` 并在 `src/tools/index.ts` 中加入一项，数组顺序就是顶部分类的顺序。
- 分类内的工具自动按名称排序（中文按拼音、英文按字母，按首字母混排），定义时的顺序不影响显示。英文和日文界面按对应语言的排序规则排列。
- 新增分类时，在 `src/locales/tools.ts` 的 `CATEGORY_NAMES` 里写上分类在各语言的名称。

## 代码约定

- **命名**：工具名要一看就知道做什么，例如「JSON 差异对比」而不是「对比」；功能相近的工具合并成一个。
- **逻辑与界面分离**：处理数据的逻辑写成纯函数，放在所属工具目录，并在旁边的 `*.test.ts` 写测试。
- **复用界面组件**：优先使用 `TextPane`、`CopyList`、`FileDropZone`、`TwoWayConvert` 和 `controls.css` 中的样式，保持风格一致。
- **颜色只用变量**：使用 `theme.css` 中的 CSS 变量，深色模式会自动适配。
- **全局事件**：监听 `window` 事件（如粘贴）请用 `useWindowEvent`，工具切到后台时会自动暂停。
- **图标**：在 [lucide.dev/icons](https://lucide.dev/icons) 查找。
- **提交前**：运行 `npm run typecheck` 和 `npm test`，云端打包时也会执行这两步。

新增工具后，若 Vitest 仍使用缓存中的旧 `import.meta.glob` 清单，先运行 `npm test -- --clearCache`，再运行 `npm test`。

[返回开发指南](../DEVELOPMENT.md)
