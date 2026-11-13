import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "messages": {
    "zh-CN": {
      "json": {
        "errorAt": "第 {line} 行第 {column} 列：{message}",
        "leftSide": "左侧 {error}",
        "rightSide": "右侧 {error}"
      }
    },
    "en": {
      "json": {
        "errorAt": "Line {line}, column {column}: {message}",
        "leftSide": "Left: {error}",
        "rightSide": "Right: {error}"
      }
    },
    "ja": {
      "json": {
        "errorAt": "{line} 行 {column} 列：{message}",
        "leftSide": "左：{error}",
        "rightSide": "右：{error}"
      }
    }
  }
});
