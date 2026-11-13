import { defineAsyncComponent } from "vue";
import { escapeJson, unescapeJson } from "./escape";
import { parseJson, formatJson } from "../shared/json";
import { Quote } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "json-escape",
  name: "JSON 字符串转义",
  desc: "把日志里 {\\\"a\\\":1} 这种被转义的 JSON 还原，或反过来转义",
  icon: Quote,
  inputPlaceholder: '例如 {\\"name\\":\\"Open Tools\\"}',
  sessions: true,
  component: defineAsyncComponent(() => import("./JsonEscape.vue")),
  actions: [
    {
      label: "去转义",
      primary: true,
      // 去转义后如果是合法 JSON，顺便格式化
      run: (s) => {
        const text = unescapeJson(s);
        const parsed = parseJson(text);
        return parsed.ok ? formatJson(parsed.value) : text;
      },
    },
    { label: "转义", run: escapeJson },
  ],
};

export default tool;
