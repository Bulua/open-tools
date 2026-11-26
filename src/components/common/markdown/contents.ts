import { Plugin } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { $nodeSchema, $prose, $remark } from "@milkdown/utils";

declare module "mdast" {
  interface RootContentMap {
    notebookToc: { type: "notebookToc" };
  }
}

const parseContents = $remark("notebookContents", () => () => (tree, file) => {
  const source = String(file.value);
  tree.children = tree.children.map(node => {
    if (node.type !== "paragraph" || node.children.length !== 1) return node;
    const [text] = node.children;
    const start = text.position?.start.offset;
    const end = text.position?.end.offset;
    return text.type === "text" && start !== undefined && end !== undefined && /^\[toc\]$/i.test(source.slice(start, end).trim())
      ? { type: "notebookToc" }
      : node;
  });
});

const contents = $nodeSchema("notebookToc", () => ({
  group: "block",
  atom: true,
  parseDOM: [{ tag: "nav[data-notebook-toc]" }],
  toDOM: () => ["nav", { "data-notebook-toc": "", contenteditable: "false" }, "[TOC]"],
  parseMarkdown: {
    match: node => node.type === "notebookToc",
    runner: (state, _, type) => { state.addNode(type); },
  },
  toMarkdown: {
    match: node => node.type.name === "notebookToc",
    runner: state => { state.addNode("html", undefined, "[TOC]"); },
  },
}));

function renderContents(view: EditorView) {
  const lists = view.dom.querySelectorAll<HTMLElement>("[data-notebook-toc]");
  if (!lists.length) return;
  const headings: { title: string; depth: number; position: number }[] = [];
  let base = 6;
  view.state.doc.descendants((node, position) => {
    if (node.type.name === "heading" && node.textContent.trim()) {
      const depth = Number(node.attrs.level);
      base = Math.min(base, depth);
      headings.push({ title: node.textContent, depth, position });
    }
  });
  for (const target of lists) {
    if (!headings.length) {
      target.textContent = "[TOC]";
      continue;
    }
    const list = document.createElement("ul");
    for (const heading of headings) {
      const item = document.createElement("li");
      item.style.paddingInlineStart = `${(heading.depth - base) * 1.05}em`;
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = heading.title;
      link.dataset.headingPosition = String(heading.position);
      item.append(link);
      list.append(item);
    }
    target.replaceChildren(list);
  }
}

const contentsView = $prose(() => new Plugin({
  view(view) {
    renderContents(view);
    return {
      update(next, previous) {
        if (next.state.doc !== previous.doc) renderContents(next);
      },
    };
  },
}));

export const contentsPlugins = [...parseContents, ...contents, contentsView];
