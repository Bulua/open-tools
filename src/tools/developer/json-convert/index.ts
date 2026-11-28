import { defineAsyncComponent } from "vue";
import { jsonToYaml, yamlToJson, jsonToTypeScript } from "./convert";
import { FileCode2 } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "json-convert",
  name: "JSON 转 YAML / TS 类型",
  desc: "JSON 与 YAML 互转，或根据 JSON 生成 TypeScript 类型定义",
  icon: FileCode2,
  inputPlaceholder: "粘贴 JSON（或 YAML），再点击下方按钮转换",
  sessions: true,
  component: defineAsyncComponent(() => import("./JsonConvert.vue")),
  actions: [
    { label: "JSON 转 YAML", primary: true, run: jsonToYaml },
    { label: "YAML 转 JSON", run: yamlToJson },
    { label: "JSON 转 TS 类型", run: (s) => jsonToTypeScript(JSON.parse(s)) },
  ],
};

export default tool;
