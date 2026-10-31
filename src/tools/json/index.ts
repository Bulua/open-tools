import { defineAsyncComponent } from "vue";
import { Braces, FileCode2, GitCompare, ListTree, Quote, ScrollText } from "lucide-vue-next";
import type { Category } from "../types";
import * as t from "./utils";

const json: Category = {
  id: "json",
  name: "Json 工具",
  tools: [
    {
      id: "json-format",
      name: "格式化 / 校验",
      desc: "美化、压缩 JSON，实时校验并定位错误",
      icon: Braces,
      component: defineAsyncComponent(() => import("./components/JsonFormat.vue")),
    },
    {
      id: "json-tree",
      name: "树形查看",
      desc: "以可折叠的树形结构浏览 JSON，复制节点路径",
      icon: ListTree,
      component: defineAsyncComponent(() => import("./components/JsonTree.vue")),
    },
    {
      id: "json-diff",
      name: "JSON 对比",
      desc: "对比两段 JSON，列出新增、删除和修改的字段",
      icon: GitCompare,
      component: defineAsyncComponent(() => import("./components/JsonDiff.vue")),
    },
    {
      id: "json-escape",
      name: "转义 / 去转义",
      desc: "处理日志里被转义成字符串的 JSON",
      icon: Quote,
      inputPlaceholder: '例如 {\\"name\\":\\"Open Tools\\"}',
      actions: [
        {
          label: "去转义",
          primary: true,
          // 去转义后如果是合法 JSON，顺便格式化
          run: (s) => {
            const text = t.unescapeJson(s);
            const parsed = t.parseJson(text);
            return parsed.ok ? t.formatJson(parsed.value) : text;
          },
        },
        { label: "转义", run: t.escapeJson },
      ],
    },
    {
      id: "json-yaml",
      name: "JSON ↔ YAML",
      desc: "JSON 与 YAML 互相转换",
      icon: ScrollText,
      actions: [
        { label: "转 YAML", primary: true, run: t.jsonToYaml },
        { label: "转 JSON", run: t.yamlToJson },
      ],
    },
    {
      id: "json-to-ts",
      name: "生成 TS 类型",
      desc: "根据 JSON 示例生成 TypeScript interface",
      icon: FileCode2,
      actions: [{ label: "生成类型", primary: true, run: (s) => t.jsonToTypeScript(JSON.parse(s)) }],
    },
  ],
};

export default json;
