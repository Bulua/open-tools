import { Fragment, Slice, type Node as ProseNode } from "@milkdown/prose/model";
import { Plugin, type SelectionBookmark } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { notebookApi } from "@/api/notebook";
import { imageWidth } from "./imageSize";
import { savePastedImages } from "./storage";

const embeddedImage = /^data:image\/(?:png|jpeg|gif|webp|bmp|avif);base64,/i;
const assetImage = /^(?:\.\/)?assets\/(image-[a-f0-9]{64}\.(png|jpg|gif|webp|bmp|avif))$/;

export function clipboardImageFiles(data: DataTransfer): File[] {
  const files = Array.from(data.files).filter(file => file.type.startsWith("image/"));
  return files.length ? files : Array.from(data.items)
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile()).filter((file): file is File => file !== null);
}

export type ImageSizeTarget = {
  width: number | null;
  naturalWidth: number;
  resize: (width: number | null) => void;
};

export function notebookImageView(
  id: string,
  node: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
  onContext?: (event: MouseEvent, target: ImageSizeTarget) => void,
) {
  const img = document.createElement("img");
  const src = node.attrs.src as string;
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  updateAttributes(node);

  function updateAttributes(current: ProseNode) {
    img.alt = current.attrs.alt;
    img.title = current.attrs.title;
    const width = imageWidth(current.attrs.width);
    if (width === null) img.removeAttribute("width");
    else img.setAttribute("width", String(width));
  }

  if (onContext) {
    img.addEventListener("contextmenu", event => {
      if (!view.editable) return;
      event.preventDefault();
      onContext(event, {
        width: imageWidth(node.attrs.width),
        naturalWidth: img.naturalWidth,
        resize(width) {
          if (view.isDestroyed || !view.editable) return;
          const pos = getPos();
          if (pos === undefined || view.state.doc.nodeAt(pos) !== node) return;
          view.dispatch(view.state.tr.setNodeAttribute(pos, "width", imageWidth(width)));
          view.focus();
        },
      });
    });
  }

  if (/^https?:\/\/[^/]/i.test(src) || embeddedImage.test(src)) img.src = src;
  const asset = assetImage.exec(src);

  let url: string | undefined;
  let destroyed = false;
  // 磁盘路径不进入 DOM，Markdown 和剪贴板也继续使用相对引用。
  if (asset) {
    const [, name, ext] = asset;
    void notebookApi.readImage(id, name).then(data => {
      if (destroyed) return;
      url = URL.createObjectURL(new Blob([data], { type: `image/${ext === "jpg" ? "jpeg" : ext}` }));
      img.src = url;
    }).catch(() => {
      // 附件可以在应用外被移除，保留引用和替代文字。
    });
  }
  return {
    dom: img,
    update(next: ProseNode) {
      if (next.type !== node.type || next.attrs.src !== src) return false;
      node = next;
      updateAttributes(next);
      return true;
    },
    destroy() {
      destroyed = true;
      if (url) URL.revokeObjectURL(url);
    },
  };
}

function replaceEmbeddedImages(fragment: Fragment, replacements: Map<string, string>): Fragment {
  const nodes: ProseNode[] = [];
  fragment.forEach(node => {
    const src = node.type.name === "image" ? replacements.get(node.attrs.src) : undefined;
    nodes.push(src
      ? node.type.create({ ...node.attrs, src }, node.content, node.marks)
      : node.isLeaf ? node : node.copy(replaceEmbeddedImages(node.content, replacements)));
  });
  return Fragment.fromArray(nodes);
}

export function notebookImagePaste(id: string) {
  const pending = new Set<{ selection: SelectionBookmark }>();
  return new Plugin({
    state: {
      init: () => null,
      apply(transaction) {
        for (const paste of pending) paste.selection = paste.selection.map(transaction.mapping);
        return null;
      },
    },
    props: {
      handlePaste(view, event, slice) {
        if (!event.clipboardData || view.state.selection.$from.parent.type.spec.code) return false;
        const embedded = new Set<string>();
        slice.content.descendants(node => {
          if (node.type.name === "image" && embeddedImage.test(node.attrs.src)) embedded.add(node.attrs.src);
        });
        const sources = [...embedded];
        const richText = event.clipboardData.getData("text/html") &&
          slice.content.textBetween(0, slice.content.size).trim();
        const images = sources.length ? sources : richText ? [] : clipboardImageFiles(event.clipboardData);
        if (!images.length) return false;

        const paste = { selection: view.state.selection.getBookmark() };
        pending.add(paste);
        const isCurrent = () => !view.isDestroyed;
        void savePastedImages(id, images, isCurrent, paths => {
          const { state } = view;
          const selection = paste.selection.resolve(state.doc);
          const pasted = sources.length
            ? new Slice(replaceEmbeddedImages(slice.content, new Map(sources.map((src, i) => [src, paths[i]]))), slice.openStart, slice.openEnd)
            : new Slice(Fragment.fromArray(paths.map(src => state.schema.nodes.image.create({ src }))), 0, 0);
          const tr = state.tr.setSelection(selection).replaceSelection(pasted).setMeta("paste", true);
          if (selection.eq(state.selection)) tr.scrollIntoView();
          else tr.setSelection(state.selection.getBookmark().map(tr.mapping).resolve(tr.doc));
          view.dispatch(tr);
        }).finally(() => pending.delete(paste));
        return true;
      },
    },
  });
}
