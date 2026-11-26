import { imageSchema } from "@milkdown/preset-commonmark";
import { $remark } from "@milkdown/utils";
import type { Image } from "mdast";
import type { Node, Parent } from "unist";

export function imageWidth(value: unknown): number | null {
  const width = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof width === "number" && Number.isSafeInteger(width) && width > 0 ? width : null;
}

type SizedImage = Image & { width: number };
type HtmlNode = Node & { type: "html"; value: string };

function parseSizedImage(html: string): SizedImage | undefined {
  if (!/^\s*<img\s/i.test(html)) return;
  // 在惰性的模板中读取属性，正文只接收图片节点及其已知属性。
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const img = template.content.firstChild;
  if (template.content.childNodes.length !== 1 || !(img instanceof HTMLImageElement)) return;
  const url = img.getAttribute("src");
  const width = imageWidth(img.getAttribute("width"));
  if (!url || width === null) return;
  return { type: "image", url, alt: img.alt, title: img.title, width };
}

const blockParents = new Set(["root", "blockquote", "listItem", "footnoteDefinition"]);
function parseSizedImages(parent: Parent) {
  parent.children = parent.children.map(node => {
    if (node.type === "html") {
      const image = parseSizedImage((node as HtmlNode).value);
      if (image) return blockParents.has(parent.type) ? { type: "paragraph", children: [image] } : image;
    }
    if ("children" in node) parseSizedImages(node as Parent);
    return node;
  });
}

const parseImageHtml = $remark("notebookImageHtml", () => () => tree => parseSizedImages(tree));

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/\|/g, "&#124;").replace(/\r/g, "&#13;").replace(/\n/g, "&#10;");
}

const notebookImageSchema = imageSchema.extendSchema(previous => ctx => {
  const original = previous(ctx);
  return {
    ...original,
    attrs: { ...original.attrs, width: { default: null } },
    parseDOM: original.parseDOM?.map(rule => ({
      ...rule,
      getAttrs: dom => ({ ...rule.getAttrs?.(dom as HTMLElement), width: imageWidth((dom as HTMLElement).getAttribute("width")) }),
    })),
    parseMarkdown: {
      ...original.parseMarkdown,
      runner(state, node, type) {
        state.addNode(type, {
          src: node.url ?? "",
          alt: node.alt ?? "",
          title: node.title ?? "",
          width: imageWidth(node.width),
        });
      },
    },
    toMarkdown: {
      ...original.toMarkdown,
      runner(state, node) {
        const width = imageWidth(node.attrs.width);
        if (width === null) {
          original.toMarkdown.runner(state, node);
          return;
        }
        const src = escapeAttribute(node.attrs.src);
        const alt = escapeAttribute(node.attrs.alt);
        const title = node.attrs.title ? ` title="${escapeAttribute(node.attrs.title)}"` : "";
        state.addNode("html", undefined, `<img src="${src}" alt="${alt}"${title} width="${width}">`);
      },
    },
  };
});

export const imageSizePlugins = [notebookImageSchema, parseImageHtml].flat();
