import type { RootContent } from "mdast";
import type { NodeViewConstructor } from "@milkdown/prose/view";
import { $nodeSchema, $remark } from "@milkdown/utils";

declare module "mdast" {
  interface RootContentMap {
    notebookMermaid: { type: "notebookMermaid"; value: string; lang: string; meta?: string | null };
  }
}

export const isMermaid = (language: string) => language.toLowerCase() === "mermaid";

function convertDiagram(node: RootContent): RootContent {
  if (node.type === "code" && node.lang && isMermaid(node.lang)) {
    return { type: "notebookMermaid", value: node.value, lang: node.lang, meta: node.meta };
  }
  if ("children" in node) {
    // 标题、列表、引用等共用同一棵 Markdown 树，只替换代码块。
    const children = node.children as RootContent[];
    children.forEach((child, index) => { children[index] = convertDiagram(child); });
  }
  return node;
}

const parseDiagrams = $remark("notebookMermaid", () => () => tree => {
  tree.children = tree.children.map(convertDiagram);
});

const diagram = $nodeSchema("notebookMermaid", () => ({
  group: "block",
  atom: true,
  attrs: { value: { default: "" }, lang: { default: "mermaid" }, meta: { default: null } },
  parseDOM: [{
    tag: "pre[data-notebook-mermaid]",
    priority: 60,
    getAttrs: element => ({
      value: element.textContent ?? "",
      lang: element.getAttribute("data-language") ?? "mermaid",
      meta: element.getAttribute("data-meta"),
    }),
  }],
  toDOM: node => ["pre", {
    "data-notebook-mermaid": "", "data-language": node.attrs.lang, "data-meta": node.attrs.meta,
  }, ["code", node.attrs.value]],
  parseMarkdown: {
    match: node => node.type === "notebookMermaid",
    runner: (state, node, type) => { state.addNode(type, { value: node.value, lang: node.lang, meta: node.meta }); },
  },
  toMarkdown: {
    match: node => node.type.name === "notebookMermaid",
    runner: (state, node) => {
      state.addNode("code", undefined, node.attrs.value, { lang: node.attrs.lang, meta: node.attrs.meta });
    },
  },
}));

export const mermaidPlugins = [...parseDiagrams, ...diagram];

let renderQueue: Promise<unknown> = Promise.resolve();
let nextDiagram = 0;

function renderDiagram(source: string, dark: boolean) {
  // Mermaid 的配置是全局的。顺序执行，避免多张图交错使用主题配置。
  const render = async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      theme: dark ? "dark" : "default",
      secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "maxEdges", "suppressErrorRendering", "dompurifyConfig", "themeCSS"],
    });
    return (await mermaid.render(`notebook-mermaid-${++nextDiagram}`, source)).svg;
  };
  const job = renderQueue.then(render, render);
  renderQueue = job;
  return job;
}

function sizePreview(preview: HTMLButtonElement, svg: string) {
  // Mermaid 的 SVG 通常使用百分比宽度，预览应以 viewBox 的自然尺寸为上限。
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const bounds = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (!bounds || bounds.length !== 4) return;
  const [, , width, height] = bounds;
  const ratio = width / height;
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(ratio) || ratio <= 0) return;
  preview.style.setProperty("--mermaid-width", `${width}px`);
  preview.style.setProperty("--mermaid-ratio", String(ratio));
}

export type MermaidLabel = "mermaidDiagram" | "editMermaid" | "mermaidEmpty" | "mermaidLoading" | "mermaidError";

export function mermaidView(label: (key: MermaidLabel) => string): NodeViewConstructor {
  return (initial, view, getPos) => {
    let node = initial;
    const doc = view.dom.ownerDocument;
    const dom = doc.createElement("div");
    dom.className = "note-mermaid";
    dom.contentEditable = "false";
    const frame = doc.createElement("div");
    frame.className = "mermaid-frame";
    const preview = doc.createElement("button");
    preview.type = "button";
    preview.className = "mermaid-preview";
    preview.setAttribute("aria-label", label("editMermaid"));
    preview.setAttribute("aria-expanded", "false");
    const status = doc.createElement("span");
    status.className = "mermaid-status";
    status.setAttribute("role", "status");
    const input = doc.createElement("textarea");
    input.className = "mermaid-source field";
    input.setAttribute("aria-label", label("editMermaid"));
    input.spellcheck = false;
    input.wrap = "off";
    const source = doc.createElement("div");
    source.className = "mermaid-editor";
    source.hidden = true;
    const gutter = doc.createElement("div");
    gutter.className = "mermaid-gutter";
    gutter.setAttribute("aria-hidden", "true");
    const numbers = doc.createElement("div");
    gutter.append(numbers);
    source.append(gutter, input);
    frame.append(preview);
    dom.append(source, frame);

    let editing = false;
    let original = "";
    let generation = 0;
    let disposed = false;
    let pendingRender: ReturnType<typeof setTimeout> | undefined;

    function showStatus(key: MermaidLabel) {
      preview.removeAttribute("style");
      status.textContent = label(key);
      preview.replaceChildren(status);
    }

    async function render() {
      clearTimeout(pendingRender);
      pendingRender = undefined;
      const request = ++generation;
      const source: string = node.attrs.value;
      if (!source.trim()) {
        showStatus("mermaidEmpty");
        return;
      }
      if (!preview.querySelector("img")) showStatus("mermaidLoading");
      try {
        const svg = await renderDiagram(source, doc.documentElement.dataset.theme === "dark");
        if (disposed || request !== generation) return;
        const img = doc.createElement("img");
        img.alt = label("mermaidDiagram");
        preview.removeAttribute("style");
        sizePreview(preview, svg);
        // SVG 作为图片显示，图表内容不会注入编辑器 DOM。
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        preview.replaceChildren(img);
      } catch {
        if (disposed || request !== generation) return;
        showStatus("mermaidError");
      }
    }

    function scheduleRender() {
      generation++;
      clearTimeout(pendingRender);
      pendingRender = setTimeout(() => { void render(); }, 250);
    }

    function commit(value: string) {
      const position = getPos();
      if (position !== undefined && value !== node.attrs.value) {
        view.dispatch(view.state.tr.setNodeAttribute(position, "value", value));
      }
    }

    function syncNumberScroll() {
      numbers.style.transform = `translateY(${-input.scrollTop}px)`;
    }

    function updateNumbers() {
      const lines = input.value.split("\n").length;
      input.rows = Math.min(Math.max(lines, 2), 10);
      gutter.style.setProperty("--mermaid-line-digits", String(String(lines).length));
      numbers.textContent = Array.from({ length: lines }, (_, index) => index + 1).join("\n");
      syncNumberScroll();
    }

    function closeOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!source.contains(target) && !preview.contains(target)) endEdit(true);
    }

    function beginEdit() {
      if (!view.editable) return;
      if (!editing) {
        editing = true;
        original = node.attrs.value;
        input.value = original;
        source.hidden = false;
        input.scrollTop = 0;
        updateNumbers();
        preview.setAttribute("aria-expanded", "true");
        doc.addEventListener("click", closeOutside, true);
      }
      input.focus();
    }

    function endEdit(save: boolean) {
      if (!editing) return;
      commit(save ? input.value : original);
      editing = false;
      source.hidden = true;
      preview.setAttribute("aria-expanded", "false");
      doc.removeEventListener("click", closeOutside, true);
      if (pendingRender !== undefined) void render();
    }

    preview.addEventListener("click", beginEdit);
    input.addEventListener("input", () => {
      updateNumbers();
      commit(input.value);
    });
    input.addEventListener("scroll", syncNumberScroll);
    input.addEventListener("keydown", event => {
      if (event.isComposing || (event.key !== "Escape" && !(event.key === "Enter" && event.ctrlKey))) return;
      event.preventDefault();
      endEdit(event.key !== "Escape");
      view.focus();
    });
    const theme = new MutationObserver(() => { void render(); });
    theme.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    void render();
    return {
      dom,
      update(updated) {
        if (updated.type !== node.type) return false;
        const changed = updated.attrs.value !== node.attrs.value;
        node = updated;
        if (changed) {
          if (editing) scheduleRender();
          else void render();
        }
        return true;
      },
      stopEvent(event) { return source.contains(event.target as Node) || preview.contains(event.target as Node); },
      ignoreMutation() { return true; },
      destroy() {
        disposed = true;
        clearTimeout(pendingRender);
        doc.removeEventListener("click", closeOutside, true);
        theme.disconnect();
      },
    };
  };
}
