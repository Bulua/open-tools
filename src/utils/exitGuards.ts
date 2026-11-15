/** 安装更新会强制退出进程，先让持有文档的工具处理未保存内容。 */
const guards = new Map<string, () => Promise<boolean>>();
export function registerExitGuard(id: string, guard: () => Promise<boolean>): () => void {
  guards.set(id, guard);
  return () => { if (guards.get(id) === guard) guards.delete(id); };
}
export async function prepareToExit(): Promise<boolean> {
  for (const guard of [...guards.values()]) if (!(await guard())) return false;
  return true;
}
