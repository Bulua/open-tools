interface Entry {
  id: string;
  parentId: string | null;
  name: string;
}

export type Folder = Entry & { kind: "folder"; collapsed: boolean };
export type Note = Entry & { kind: "note"; markdown: string };
export type Node = Folder | Note;
export interface Notebook {
  version: 1;
  selectedId: string | null;
  nodes: Node[];
}

export const emptyNotebook = (): Notebook => ({ version: 1, selectedId: null, nodes: [] });

export function uniqueNoteName(nodes: Node[], parentId: string | null, name: string, currentId?: string): string {
  const stem = name.replace(/\.md$/i, "");
  const extension = name.slice(stem.length);
  const siblings = new Set(nodes
    .filter(node => node.kind === "note" && node.parentId === parentId && node.id !== currentId)
    .map(node => node.name.replace(/\.md$/i, "").toUpperCase()));
  let candidate = stem;
  for (let number = 2; siblings.has(candidate.toUpperCase()); number++) candidate = `${stem} (${number})`;
  return candidate + extension;
}

function indexChildren(nodes: Node[]) {
  const children = new Map<string | null, Node[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId);
    if (siblings) siblings.push(node);
    else children.set(node.parentId, [node]);
  }
  return children;
}

export function directoryRows(nodes: Node[], includeCollapsed = false) {
  const children = indexChildren(nodes);
  const stack = (children.get(null) ?? []).map(node => ({ node, depth: 0 })).reverse();
  const rows: typeof stack = [];
  while (stack.length) {
    const row = stack.pop()!;
    rows.push(row);
    if (row.node.kind === "folder" && (includeCollapsed || !row.node.collapsed)) {
      const descendants = children.get(row.node.id) ?? [];
      for (let i = descendants.length - 1; i >= 0; i--) {
        stack.push({ node: descendants[i], depth: row.depth + 1 });
      }
    }
  }
  return rows;
}

export function subtree(nodes: Node[], id: string): Set<string> {
  const children = indexChildren(nodes);
  const ids = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    if (ids.has(current)) continue;
    ids.add(current);
    for (const child of children.get(current) ?? []) stack.push(child.id);
  }
  return ids;
}

export type DirectoryDrop = { id: string; position: "before" | "after" | "inside" } | null;

/** 空白处追加到根目录；项目上下边缘用于排序，文件夹中间用于移入。 */
export function moveEntry(notebook: Notebook, id: string, drop: DirectoryDrop): boolean {
  const moving = notebook.nodes.find(node => node.id === id);
  const target = drop && notebook.nodes.find(node => node.id === drop.id);
  if (!moving || (drop && !target)) return false;
  if (target && subtree(notebook.nodes, id).has(target.id)) return false;

  const inside = drop?.position === "inside";
  if (inside && target?.kind !== "folder") return false;
  const next = notebook.nodes.filter(node => node.id !== id);
  const anchor = target && !inside ? next.indexOf(target) : next.length;
  const offset = drop?.position === "after" ? 1 : 0;
  moving.parentId = inside && target ? target.id : target?.parentId ?? null;
  next.splice(anchor + offset, 0, moving);
  if (inside && target?.kind === "folder") target.collapsed = false;
  notebook.nodes = next;
  return true;
}

export function readNotebook(raw: string): Notebook {
  const stored = JSON.parse(raw) as Partial<Notebook> | null;
  if (stored?.version !== 1 || !Array.isArray(stored.nodes)) {
    throw new Error("Invalid notebook format");
  }
  const ids = new Set<string>();
  const nodes: Node[] = [];
  for (const node of stored.nodes) {
    if (!node || typeof node.id !== "string" || !node.id || ids.has(node.id) ||
      typeof node.name !== "string" || !node.name.trim() ||
      (node.parentId !== null && typeof node.parentId !== "string")) {
      throw new Error("Invalid notebook entry");
    }
    const { id, name, parentId } = node;
    if (node.kind === "folder" && typeof node.collapsed === "boolean") {
      nodes.push({ id, name, parentId, kind: "folder", collapsed: node.collapsed });
    } else if (node.kind === "note" && typeof node.markdown === "string") {
      nodes.push({ id, name, parentId, kind: "note", markdown: node.markdown });
    } else {
      throw new Error("Invalid notebook entry");
    }
    ids.add(id);
  }
  // 失去父目录或组成环的数据不会出现在遍历结果里。保留原始存档，避免覆盖。
  if (directoryRows(nodes, true).length !== nodes.length) throw new Error("Invalid notebook hierarchy");
  const selectedId = typeof stored.selectedId === "string" && ids.has(stored.selectedId) ? stored.selectedId : null;
  return { version: 1, selectedId, nodes };
}
