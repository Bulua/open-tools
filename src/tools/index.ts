/**
 * 工具注册表：决定顶部有哪些分类、每个分类下有哪些工具。
 *
 * 工具的代码按 tools/<模块>/<工具ID>/ 组织，每个工具的 index.ts 定义入口，模块 index.ts 只做聚合，
 * 显示时按用途重新归类：在下面的 categories 中用工具 id 挑选。新增工具后记得把它的 id 加到某个分类里，
 * 测试会检查每个工具都恰好出现在一个分类中。
 */
import type { Category, Tool } from "./types";
import type { AppPlatform } from "@/utils/platform";
import json from "./json";
import encode from "./encode";
import convert from "./convert";
import image from "./image";
import network from "./network";
import document from "./document";
import markdown from "./markdown";
import utility from "./utility";
import audio from "./audio";
import video from "./video";

/** 所有模块中的工具 */
export const allTools: Tool[] = [json, encode, convert, image, audio, video, network, document, markdown, utility].flatMap((m) => m.tools);

const pick = (...ids: string[]): Tool[] =>
  ids.map((id) => {
    const tool = allTools.find((t) => t.id === id);
    if (!tool) throw new Error(`没有 id 为「${id}」的工具`);
    return tool;
  });

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
export const categories: Category[] = [
  { id: "developer", name: "开发工具", tools: [...json.tools, ...pick("base64", "text-escape", "hash", "jwt", "regex", "naming")] },
  { id: "daily", name: "日常工具", tools: pick("password", "password-vault", "clipboard-history", "id-card") },
  { id: "time", name: "时间", tools: pick("timestamp", "timezone", "cron", "countdown", "calendar") },
  { id: "calc", name: "计算换算", tools: pick("calculator", "units", "radix") },
  { id: "image", name: "图片", tools: [...image.tools, ...pick("color")] },
  { id: "audio", name: "音频", tools: audio.tools },
  { id: "video", name: "视频", tools: video.tools },
  {
    id: "document",
    name: "文档与文件",
    tools: pick("word-to-pdf", "pdf-to-word", "word-watermark", "word-unwatermark", "pdf-pages", "pdf-unwatermark", "markdown-editor", "markdown-to-word", "archive", "extract"),
  },
  { id: "network", name: "网络", tools: network.tools },
].map(sortTools);

/** 按工具定义筛选平台可用项，保留分类及工具的显示顺序。 */
export function categoriesForPlatform(list: Category[], platform: AppPlatform): Category[] {
  return list.map((category) => ({
    ...category,
    tools: category.tools.filter((tool) => !tool.platforms || tool.platforms.includes(platform)),
  }));
}

export * from "./types";
