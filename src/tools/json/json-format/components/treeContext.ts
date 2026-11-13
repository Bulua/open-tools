import type { InjectionKey, Ref } from "vue";

/** JsonTree 与各层 JsonTreeNode 共享的状态 */
export interface TreeContext {
  /** 当前选中节点的路径，例如 $.users[0].name */
  selected: Ref<string>;
  /** 每次点击「全部展开 / 全部折叠」都会替换为新对象，节点据此同步展开状态 */
  signal: Ref<{ expand: boolean }>;
}

export const TREE_CONTEXT: InjectionKey<TreeContext> = Symbol("json-tree");
