import type { PhrasingContent, RootContent } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { remarkHighlightMark } from "remark-highlight-mark";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { prefersReducedMotion } from "@/utils/motion";

const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, "yaml")
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
  .use(remarkHighlightMark);

export interface OutlineHeading {
  title: string;
  depth: number;
  offset: number;
  index: number;
}

function headingText(node: PhrasingContent): string {
  if (node.type === "break") return " ";
  if ("alt" in node) return node.alt ?? "";
  if ("children" in node) return node.children.map(headingText).join("");
  if ("value" in node && node.type !== "html") return node.value;
  return "";
}

export function markdownOutline(markdown: string): OutlineHeading[] {
  // textarea 统一使用 LF，标题偏移也按这一表示计算。
  const root = parser.parse(markdown.replace(/\r\n?/g, "\n"));
  const headings: OutlineHeading[] = [];
  let index = 0;
  function visit(node: RootContent) {
    if (node.type === "heading") {
      const title = node.children.map(headingText).join("").replace(/\s+/g, " ").trim();
      const offset = node.position?.start.offset;
      if (title && offset !== undefined) headings.push({ title, depth: node.depth, offset, index });
      index++;
    } else if ("children" in node) {
      node.children.forEach(child => visit(child as RootContent));
    }
  }
  root.children.forEach(visit);
  return headings;
}

export function scrollSourceToHeading(input: HTMLTextAreaElement, offset: number) {
  const { ownerDocument, value } = input;
  const mirror = ownerDocument.createElement("div");
  const marker = ownerDocument.createElement("span");
  const style = getComputedStyle(input);
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  // 用和源码框相同的宽度及字体测量自动折行后的行首。
  Object.assign(mirror.style, {
    position: "fixed",
    visibility: "hidden",
    pointerEvents: "none",
    width: `${Math.max(0, input.clientWidth - padding)}px`,
    font: style.font,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    tabSize: style.tabSize,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  });
  marker.textContent = value.slice(offset).split("\n", 1)[0] || " ";
  mirror.append(value.slice(0, offset), marker);
  ownerDocument.body.append(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  const previousTop = input.scrollTop;
  input.focus({ preventScroll: true });
  input.setSelectionRange(offset, offset);
  if (prefersReducedMotion() || !input.scrollTo) {
    input.scrollTop = top;
  } else {
    if (input.scrollTop !== previousTop) input.scrollTop = previousTop;
    input.scrollTo({ top, behavior: "smooth" });
  }
}
