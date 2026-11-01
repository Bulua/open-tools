import { defineAsyncComponent } from "vue";
import { Braces, FileCode2, GitCompare, Quote } from "lucide-vue-next";
import type { Category } from "../types";
import * as t from "./utils";

const json: Category = {
  id: "json",
  name: "Json 工具",
  tools: [
    {
      id: "json-format",
      name: "JSON 格式化",
      desc: "美化、压缩、树形查看 JSON，实时校验并定位错误",
      icon: Braces,
      component: defineAsyncComponent(() => import("./components/JsonFormat.vue")),
      sessions: true,
    },
    {
      id: "json-diff",
      name: "JSON 差异对比",
      desc: "对比两段 JSON，列出新增、删除和修改的字段",
      icon: GitCompare,
      component: defineAsyncComponent(() => import("./components/JsonDiff.vue")),
      sessions: true,
    },
    {
      id: "json-escape",
      name: "JSON 字符串转义",
      desc: "把日志里 {\\\"a\\\":1} 这种被转义的 JSON 还原，或反过来转义",
      icon: Quote,
      inputPlaceholder: '例如 {\\"name\\":\\"Open Tools\\"}',
      sessions: true,
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
      id: "json-convert",
      name: "JSON 转 YAML / TS 类型",
      desc: "JSON 与 YAML 互转，或根据 JSON 生成 TypeScript 类型定义",
      icon: FileCode2,
      inputPlaceholder: "粘贴 JSON（或 YAML），再点击下方按钮转换",
      sessions: true,
      actions: [
        { label: "JSON 转 YAML", primary: true, run: t.jsonToYaml },
        { label: "YAML 转 JSON", run: t.yamlToJson },
        { label: "JSON 转 TS 类型", run: (s) => t.jsonToTypeScript(JSON.parse(s)) },
      ],
    },
  ],
};

export default json;
