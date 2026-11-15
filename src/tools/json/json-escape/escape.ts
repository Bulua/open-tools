// ---------- 转义 ----------

/** 把文本转成 JSON 字符串字面量（去掉两侧引号），例如换行变成 \n */
export function escapeJson(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

/** escapeJson 的逆操作，两侧有没有引号都可以 */
export function unescapeJson(text: string): string {
  const s = text.trim();
  const quoted = s.length >= 2 && s.startsWith('"') && s.endsWith('"');
  return JSON.parse(quoted ? s : `"${s}"`);
}
