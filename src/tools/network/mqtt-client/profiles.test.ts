import { describe, expect, it } from "vitest";
import { canMove, createDraft, migrateWorkspace, moveNode, readTree, removeNode, type MqttTree, type TreeNode } from "./profiles";

const nodes = (): TreeNode[] => [
  { id: "a", name: "A", kind: "folder", parentId: null, collapsed: false },
  { id: "b", name: "B", kind: "folder", parentId: "a", collapsed: true },
  { id: "s1", name: "一", kind: "session", parentId: "b", draft: createDraft() },
  { id: "s2", name: "二", kind: "session", parentId: null, draft: createDraft() },
  { id: "s3", name: "三", kind: "session", parentId: null, draft: createDraft() },
];
describe("MQTT 会话目录", () => {
  it("移动保留子目录与会话内容，拒绝循环和非法位置", () => {
    const tree: MqttTree = { nodes: nodes(), activeId: "s1" };
    expect(canMove(tree.nodes, "a", "b")).toBe(false);
    expect(moveNode(tree, "a", "a")).toBe(false);
    expect(moveNode(tree, "s2", "missing")).toBe(false);
    expect(moveNode(tree, "s2", "s1")).toBe(false);
    expect(moveNode(tree, "b", null, "s2")).toBe(true);
    expect(tree.nodes.find(n => n.id === "s1")?.parentId).toBe("b");
    expect(moveNode(tree, "s3", null, "s2")).toBe(true);
    expect(tree.nodes.filter(n => n.parentId === null).map(n => n.id)).toEqual(["a", "b", "s3", "s2"]);
    expect(moveNode(tree, "s2", "b")).toBe(true);
    expect(tree.nodes.find(n => n.id === "b")).toMatchObject({ collapsed: false });
    expect(tree.activeId).toBe("s1");
  });
  it("递归删除仅影响目标子树，保留其他会话和可用的选择", () => {
    const tree: MqttTree = { nodes: nodes(), activeId: "s1" };
    removeNode(tree, "a"); expect(tree.nodes.map(n => n.id)).toEqual(["s2", "s3"]); expect(tree.activeId).toBe("s2");
    removeNode(tree, "s2"); removeNode(tree, "s3"); expect(tree.activeId).toBe(""); expect(tree.nodes).toEqual([]);
  });
  it("读取时修复孤立父级、循环和重复 ID，不恢复密码及消息", () => {
    const input = nodes(); input[0].parentId = "b";
    (input[2] as unknown as { draft: { config: { password: string }; messages: string[] } }).draft.config.password = "secret";
    const tree = readTree({ nodes: [...input, input[0]], activeId: "missing" })!;
    expect(tree.nodes).toHaveLength(5); expect(tree.nodes[0].parentId).toBeNull(); expect(tree.activeId).toBe("s1");
    expect(JSON.stringify(tree)).not.toContain("secret"); expect(readTree({})).toBeNull();
    expect(readTree({ nodes: [], activeId: "" })).toEqual({ nodes: [], activeId: "" });
  });
  it("旧配置和未保存草稿都迁入目录，避免覆盖原配置", () => {
    const saved = createDraft(); const draft = { ...saved, publishTopic: "changed/topic" };
    const migrated = migrateWorkspace({ profiles: [{ id: "old", name: "旧配置", draft: saved }], profileId: "old", profileName: "编辑中", draft });
    expect(migrated.nodes).toHaveLength(2); expect(migrated.nodes[0]).toMatchObject({ id: "old", draft: saved });
    expect(migrated.nodes[1]).toMatchObject({ name: "编辑中", draft }); expect(migrated.activeId).toBe(migrated.nodes[1].id);
    const same = migrateWorkspace({ profiles: [{ id: "old", name: "旧配置", draft: saved }], profileId: "old", draft: saved });
    expect(same.nodes).toHaveLength(1); expect(same.activeId).toBe("old");
  });
});
