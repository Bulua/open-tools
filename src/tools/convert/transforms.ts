/** 命名风格转换用到的纯函数，不依赖界面，便于测试 */

/**
 * 把各种写法拆成单词：
 * helloWorld / HelloWorld / hello_world / hello-world / hello world / HELLO_WORLD → ["hello", "world"]
 */
export function splitWords(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-./]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export const NAMING_STYLES: { label: string; example: string; convert: (s: string) => string }[] = [
  { label: "小驼峰", example: "helloWorld", convert: (s) => splitWords(s).map((w, i) => (i ? cap(w) : w)).join("") },
  { label: "大驼峰", example: "HelloWorld", convert: (s) => splitWords(s).map(cap).join("") },
  { label: "下划线", example: "hello_world", convert: (s) => splitWords(s).join("_") },
  { label: "常量", example: "HELLO_WORLD", convert: (s) => splitWords(s).join("_").toUpperCase() },
  { label: "短横线", example: "hello-world", convert: (s) => splitWords(s).join("-") },
  { label: "点分隔", example: "hello.world", convert: (s) => splitWords(s).join(".") },
  { label: "全部大写", example: "HELLO WORLD", convert: (s) => s.toUpperCase() },
  { label: "全部小写", example: "hello world", convert: (s) => s.toLowerCase() },
];

/** 多行文本逐行转换 */
export const convertLines = (text: string, convert: (s: string) => string) =>
  text
    .split("\n")
    .map((line) => convert(line))
    .join("\n");
