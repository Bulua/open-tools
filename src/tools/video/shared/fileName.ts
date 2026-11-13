/** 文件名中不能用的字符换掉，太长的截断 */
export function safeFileName(name: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  return (clean || "bilibili").slice(0, 120);
}
