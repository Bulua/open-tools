import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "json-convert": {
        "name": "JSON to YAML / TS Types",
        "desc": "Convert between JSON and YAML, or generate TypeScript type definitions from JSON",
        "placeholder": "Paste JSON (or YAML), then click a button below to convert",
        "actions": [
          "JSON to YAML",
          "YAML to JSON",
          "JSON to TS types"
        ]
      }
    },
    "ja": {
      "json-convert": {
        "name": "JSON → YAML / TS 型",
        "desc": "JSON と YAML を相互変換、または JSON から TypeScript の型定義を生成します",
        "placeholder": "JSON（または YAML）を貼り付けて、下のボタンで変換します",
        "actions": [
          "JSON → YAML",
          "YAML → JSON",
          "JSON → TS 型"
        ]
      }
    }
  }
});
