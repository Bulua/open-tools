import type { Translations } from "@/locales/types";

export const NAMING_NAMES: Translations<Record<string, string>> = {
  en: {
    helloWorld: "camelCase",
    HelloWorld: "PascalCase",
    hello_world: "snake_case",
    HELLO_WORLD: "CONSTANT_CASE",
    "hello-world": "kebab-case",
    "hello.world": "dot.case",
    "HELLO WORLD": "UPPER CASE",
    "hello world": "lower case",
  },
  ja: {
    helloWorld: "キャメルケース",
    HelloWorld: "パスカルケース",
    hello_world: "スネークケース",
    HELLO_WORLD: "定数（大文字スネーク）",
    "hello-world": "ケバブケース",
    "hello.world": "ドット区切り",
    "HELLO WORLD": "すべて大文字",
    "hello world": "すべて小文字",
  },
};
