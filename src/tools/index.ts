/**
 * 工具注册表：决定顶部有哪些分类、每个分类下有哪些工具。
 *
 * 工具的代码按 tools/<分类>/<工具ID>/ 组织，与顶部分类一一对应。每个工具的 index.ts 定义入口，
 * 分类模块 index.ts 负责汇总，下面的 categories 与之保持一致。
 */
import type { Category, Tool } from "./types";
import developer from "./developer";
import daily from "./daily";
import time from "./time";
import calc from "./calc";
import image from "./image";
import audio from "./audio";
import video from "./video";
import document from "./document";
import network from "./network";

const moduleCategories: Category[] = [developer, daily, time, calc, image, audio, video, document, network];

/** 所有模块中的工具 */
export const allTools: Tool[] = moduleCategories.flatMap((m) => m.tools);

/**
 * 每个分类下的工具按名称排序：中文按拼音，英文按字母，两者按首字母混排（如 Base64、Cron、倒计时）。
 * 拼音首字母通过与各字母的第一个汉字比较得到（利用系统的中文排序规则）。
 */
const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
const LETTERS = "ABCDEFGHJKLMNOPQRSTWXYZ";
const FIRST_HAN = "阿八嚓哒妸发旮哈讥咔垃痳拏噢妑七呥扨它穵夕丫帀";
export function initialOf(name: string): string {
  const ch = name.trim()[0] ?? "";
  if (/[a-z]/i.test(ch)) return ch.toUpperCase();
  if (!/[一-鿿]/.test(ch)) return "#";
  let letter = "#";
  for (let i = 0; i < FIRST_HAN.length; i++) if (collator.compare(ch, FIRST_HAN[i]) >= 0) letter = LETTERS[i];
  return letter;
}
export const compareNames = (a: string, b: string) => initialOf(a).localeCompare(initialOf(b)) || collator.compare(a, b);
const sortTools = (c: Category): Category => ({ ...c, tools: [...c.tools].sort((x, y) => compareNames(x.name, y.name)) });

/** 顶部分类，数组顺序就是显示顺序 */
export const categories: Category[] = moduleCategories.map(sortTools);

export * from "./types";
