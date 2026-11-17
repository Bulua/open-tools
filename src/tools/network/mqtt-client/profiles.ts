import { effectScope, ref, watch, type Ref } from "vue";
import { showError } from "@/utils/errorToast";
import { t } from "@/locales";
import { MAX_PAYLOAD, validTopic, type ConnectionConfig, type QoS } from "./mqtt";

export interface MqttDraft {
  config: Omit<ConnectionConfig, "password">;
  topics: { topic: string; qos: QoS }[];
  publishTopic: string; publishQos: QoS; retain: boolean; payload: string; mode: "text" | "json";
  filterTopic: string; subscriptionQos: QoS;
}
export interface Profile { id: string; name: string; draft: MqttDraft }
interface Workspace { draft: MqttDraft | null; profiles: Profile[]; profileId?: string; profileName?: string }
const STORAGE_KEY = "mqtt.workspace.v1";
const isQos = (value: unknown): value is QoS => value === 0 || value === 1 || value === 2;

/** 逐字段读取，旧数据或被污染的存储不能把密码等额外字段重新写回磁盘。 */
export function cleanDraft(value: unknown): MqttDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<MqttDraft>;
  const c = draft.config;
  if (!c || typeof c.host !== "string" || typeof c.clientId !== "string" || typeof c.username !== "string" ||
    typeof c.port !== "number" || !Number.isFinite(c.port) || typeof c.keepAlive !== "number" || !Number.isFinite(c.keepAlive) ||
    typeof c.tls !== "boolean" || typeof c.cleanSession !== "boolean") return null;
  const topics = Array.isArray(draft.topics) ? draft.topics.filter(item => item && typeof item.topic === "string" && validTopic(item.topic, true) && isQos(item.qos)) : [];
  return {
    config: { host: c.host, port: c.port, clientId: c.clientId, username: c.username, keepAlive: c.keepAlive, tls: c.tls, cleanSession: c.cleanSession },
    topics: [...new Map(topics.map(item => [item.topic, { topic: item.topic, qos: item.qos }])).values()],
    publishTopic: typeof draft.publishTopic === "string" ? draft.publishTopic : "test/demo",
    publishQos: isQos(draft.publishQos) ? draft.publishQos : 0,
    retain: draft.retain === true,
    payload: typeof draft.payload === "string" && new TextEncoder().encode(draft.payload).length <= MAX_PAYLOAD ? draft.payload : "",
    mode: draft.mode === "json" ? "json" : "text",
    filterTopic: typeof draft.filterTopic === "string" ? draft.filterTopic : "test/demo",
    subscriptionQos: isQos(draft.subscriptionQos) ? draft.subscriptionQos : 0,
  };
}

export type FolderNode = { id: string; parentId: string | null; name: string; kind: "folder"; collapsed: boolean };
export type SessionNode = { id: string; parentId: string | null; name: string; kind: "session"; draft: MqttDraft };
export type TreeNode = FolderNode | SessionNode;
export interface MqttTree { nodes: TreeNode[]; activeId: string }
const TREE_KEY = "mqtt.workspace.v2";

export function createDraft(): MqttDraft {
  return {
    config: { host: "127.0.0.1", port: 1883, clientId: `open-tools-${crypto.randomUUID().slice(0, 8)}`, username: "", keepAlive: 60, cleanSession: true, tls: false },
    topics: [], publishTopic: "test/demo", publishQos: 0, retain: false, payload: "", mode: "text", filterTopic: "test/demo", subscriptionQos: 0,
  };
}

/** 目录只保存父级 ID，移动文件夹时不会改动其内部会话的数据或连接。 */
export function descendants(nodes: TreeNode[], id: string): Set<string> {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) if (node.parentId && result.has(node.parentId) && !result.has(node.id)) { result.add(node.id); changed = true; }
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

export function migrateWorkspace(raw: Workspace): MqttTree {
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
