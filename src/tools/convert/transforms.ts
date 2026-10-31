/** 转换相关的纯函数，不依赖界面，便于测试 */

export const toUpper = (s: string) => s.toUpperCase();

export const toLower = (s: string) => s.toLowerCase();

/** hello_world / hello-world / hello world → helloWorld */
export const toCamel = (s: string) =>
  s.toLowerCase().replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""));

/** helloWorld / hello-world / hello world → hello_world */
export const toSnake = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
