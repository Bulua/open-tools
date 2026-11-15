/** 只整理界面显示，文件访问仍使用后端返回的完整 Windows 路径。 */
export function displayFilePath(path: string): string {
  if (/^\\\\\?\\UNC\\/i.test(path)) return `\\\\${path.slice(8)}`;
  if (/^\\\\\?\\[a-z]:\\/i.test(path)) return path.slice(4);
  return path;
}
