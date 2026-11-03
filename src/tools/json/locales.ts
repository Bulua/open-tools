import { defineModuleLocales } from "@/locales/types";

/** JSON 模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    "json-format": { name: "JSON Formatter", desc: "Beautify, minify and browse JSON as a tree, with live validation that pinpoints errors" },
    "json-diff": { name: "JSON Diff", desc: "Compare two JSON documents and list added, removed and changed fields" },
    "json-escape": {
      name: "JSON String Escape",
      desc: "Restore escaped JSON from logs (like {\\\"a\\\":1}), or escape it the other way",
      placeholder: 'e.g. {\\"name\\":\\"Open Tools\\"}',
      actions: ["Unescape", "Escape"],
    },
    "json-convert": {
      name: "JSON to YAML / TS Types",
      desc: "Convert between JSON and YAML, or generate TypeScript type definitions from JSON",
      placeholder: "Paste JSON (or YAML), then click a button below to convert",
      actions: ["JSON to YAML", "YAML to JSON", "JSON to TS types"],
    },
  },
});
