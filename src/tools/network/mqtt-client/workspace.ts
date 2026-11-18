import { effectScope, ref, watch, type Ref } from "vue";
import { showError } from "@/utils/errorToast";
import { t } from "@/locales";
import { cleanDraft, createDraft, type MqttDraft } from "./draft";

// 旧版工作区仅用于迁移，继续兼容已保存的连接。
interface LegacyWorkspace { draft: MqttDraft | null; profiles: { id: string; name: string; draft: MqttDraft }[]; profileId?: string; profileName?: string }
const STORAGE_KEY = "mqtt.workspace.v1";

export type FolderNode = { id: string; parentId: string | null; name: string; kind: "folder"; collapsed: boolean };
export type SessionNode = { id: string; parentId: string | null; name: string; kind: "session"; draft: MqttDraft };
export type TreeNode = FolderNode | SessionNode;
export interface MqttTree { nodes: TreeNode[]; activeId: string }
const TREE_KEY = "mqtt.workspace.v2";

/** 按父级建立索引，遍历目录时避免为每个文件夹重复扫描全部节点。 */
function childrenByParent(nodes: TreeNode[]) {
  const children = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId);
    if (siblings) siblings.push(node);
    else children.set(node.parentId, [node]);
  }
  return children;
}

export function visibleRows(nodes: TreeNode[]): { node: TreeNode; depth: number }[] {
  const children = childrenByParent(nodes);
  const rows: { node: TreeNode; depth: number }[] = [];
  const stack = (children.get(null) ?? []).map(node => ({ node, depth: 0 })).reverse();
  while (stack.length) {
    const row = stack.pop()!;
    rows.push(row);
    if (row.node.kind === "folder" && !row.node.collapsed) {
      stack.push(...(children.get(row.node.id) ?? []).map(node => ({ node, depth: row.depth + 1 })).reverse());
    }
  }
  return rows;
}

/** 目录只保存父级 ID，移动文件夹时不会改动其内部连接的数据。 */
export function descendants(nodes: TreeNode[], id: string): Set<string> {
  const children = childrenByParent(nodes);
  const result = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(children.get(current) ?? []).map(node => node.id));
  }
  return result;
}

export function canMove(nodes: TreeNode[], id: string, parentId: string | null): boolean {
  if (!nodes.some(node => node.id === id)) return false;
  if (parentId === null) return true;
  return nodes.some(node => node.id === parentId && node.kind === "folder") && !descendants(nodes, id).has(parentId);
}

export function moveNode(tree: MqttTree, id: string, parentId: string | null, beforeId = ""): boolean {
  if (!canMove(tree.nodes, id, parentId) || id === beforeId) return false;
  const before = beforeId ? tree.nodes.find(node => node.id === beforeId) : null;
  if (beforeId && (!before || before.parentId !== parentId)) return false;
  const moving = tree.nodes.find(node => node.id === id)!;
  const nodes = tree.nodes.filter(node => node.id !== id);
  moving.parentId = parentId;
  const index = beforeId ? nodes.findIndex(node => node.id === beforeId) : nodes.length;
  nodes.splice(index, 0, moving);
  const parent = nodes.find(node => node.id === parentId);
  if (parent?.kind === "folder") parent.collapsed = false;
  tree.nodes = nodes;
  return true;
}

export function removeNode(tree: MqttTree, id: string) {
  const removed = descendants(tree.nodes, id);
  tree.nodes = tree.nodes.filter(node => !removed.has(node.id));
  if (removed.has(tree.activeId)) tree.activeId = tree.nodes.find(node => node.kind === "session")?.id ?? "";
}

export function readTree(raw: unknown): MqttTree | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as MqttTree).nodes)) return null;
  const input = raw as MqttTree;
  const nodes: TreeNode[] = [];
  for (const item of input.nodes) {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim() || nodes.some(n => n.id === item.id)) continue;
    const base = { id: item.id, name: item.name, parentId: typeof item.parentId === "string" ? item.parentId : null };
    if (item.kind === "folder") nodes.push({ ...base, kind: "folder", collapsed: item.collapsed === true });
    if (item.kind === "session") { const draft = cleanDraft(item.draft); if (draft) nodes.push({ ...base, kind: "session", draft }); }
  }
  for (const node of nodes) {
    if (node.parentId && !nodes.some(n => n.id === node.parentId && n.kind === "folder")) node.parentId = null;
    const seen = new Set([node.id]);
    let parent = nodes.find(n => n.id === node.parentId);
    while (parent) {
      if (seen.has(parent.id)) { node.parentId = null; break; }
      seen.add(parent.id); parent = nodes.find(n => n.id === parent!.parentId);
    }
  }
  return { nodes, activeId: nodes.some(node => node.id === input.activeId && node.kind === "session") ? input.activeId : nodes.find(node => node.kind === "session")?.id ?? "" };
}

export function migrateWorkspace(raw: LegacyWorkspace): MqttTree {
  const nodes: TreeNode[] = [];
  for (const profile of raw.profiles ?? []) {
    const draft = cleanDraft(profile?.draft);
    if (draft && typeof profile.id === "string" && profile.id && typeof profile.name === "string" && profile.name.trim() && !nodes.some(n => n.id === profile.id)) nodes.push({ id: profile.id, parentId: null, name: profile.name, kind: "session", draft });
  }
  const draft = cleanDraft(raw.draft);
  let activeId = "";
  if (draft) {
    const current = nodes.find(n => n.id === raw.profileId);
    if (current?.kind === "session") {
      if (JSON.stringify(current.draft) === JSON.stringify(draft)) activeId = current.id;
      else {
        // 未保存的编辑独立迁入，保留原先保存的配置。
        activeId = crypto.randomUUID();
        nodes.push({ id: activeId, parentId: null, name: raw.profileName?.trim() || t("network.mqtt.currentDraft"), kind: "session", draft });
      }
    } else {
      activeId = crypto.randomUUID();
      nodes.push({ id: activeId, parentId: null, name: raw.profileName?.trim() || t("network.mqtt.currentDraft"), kind: "session", draft });
    }
  }
  if (!nodes.length) { activeId = crypto.randomUUID(); nodes.push({ id: activeId, parentId: null, name: t("network.mqtt.newSession"), kind: "session", draft: createDraft() }); }
  return { nodes, activeId: activeId || nodes[0].id };
}

function loadTree(): MqttTree {
  try {
    const tree = readTree(JSON.parse(localStorage.getItem(TREE_KEY) ?? "null"));
    if (tree) return tree;
  } catch { /* 目录损坏时尝试恢复旧配置。 */ }
  try { return migrateWorkspace(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") ?? { profiles: [], draft: null }); }
  catch { return migrateWorkspace({ profiles: [], draft: null }); }
}

let workspace: Ref<MqttTree> | undefined;
export function useMqttTree() {
  if (!workspace) {
    workspace = ref(loadTree());
    effectScope(true).run(() => watch(workspace!, value => {
      try { localStorage.setItem(TREE_KEY, JSON.stringify(value)); }
      catch (error) { showError(error, t("network.mqtt.storageError")); }
    }, { deep: true, flush: "sync", immediate: true }));
  }
  return workspace;
}
