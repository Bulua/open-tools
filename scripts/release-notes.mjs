// 从提交记录生成版本说明：只取 feat / fix / perf 提交，去掉类型前缀，显示在程序的更新对话框里；
// 打包、测试相关的提交（范围是 ci / build / test）用户看不到，不写进去
// 用法：node scripts/release-notes.mjs <提交范围>，例如 v0.6.6..v0.6.7
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GROUPS = [
  { types: ["feat"], title: "新功能" },
  { types: ["fix"], title: "修复" },
  { types: ["perf"], title: "优化" },
];
const INTERNAL_SCOPES = ["ci", "build", "test"];

/** 提交标题列表 → 版本说明；没有可写的内容时给一句通用说明 */
export function buildNotes(subjects) {
  const groups = GROUPS.map((g) => ({ ...g, items: [] }));
  for (const subject of subjects) {
    const m = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/.exec(subject.trim());
    if (!m || INTERNAL_SCOPES.includes(m[2])) continue;
    const group = groups.find((g) => g.types.includes(m[1]));
    if (group && !group.items.includes(m[3])) group.items.push(m[3]);
  }
  const used = groups.filter((g) => g.items.length);
  if (!used.length) return "修复问题，优化使用体验。";
  // 只有一类时不写分类标题
  if (used.length === 1) return used[0].items.map((i) => `- ${i}`).join("\n");
  return used.map((g) => `${g.title}：\n${g.items.map((i) => `- ${i}`).join("\n")}`).join("\n\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const range = process.argv[2];
  if (!range) throw new Error("用法：node scripts/release-notes.mjs <提交范围>");
  const log = execFileSync("git", ["log", range, "--no-merges", "--reverse", "--format=%s"], { encoding: "utf8" });
  console.log(buildNotes(log.split("\n").filter(Boolean)));
}
