import { computed, ref, shallowReactive } from "vue";
import { largeFileApi, type LargeFileApi } from "@/api/large-file";
import { createTextController, type TextController } from "./controller";

export const MAX_TEXT_TABS = 8;
export type TabCloseScope = "current" | "left" | "right";
export interface TextTab { key: number; controller: TextController }
const pathKey = (path: string) => {
  if (!/^[a-z]:[\\/]|^\\\\/i.test(path)) return path;
  return path.replace(/\//g, "\\").replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/, "").toLowerCase();
};

/** 每个标签拥有独立控制器；标签切换不关闭会话，也不暂存或覆盖其他文件。 */
export function createTextWorkspace(api: LargeFileApi = largeFileApi) {
  const tabs = shallowReactive<TextTab[]>([]);
  const activeKey = ref<number>();
  const opening = ref(false);
  const active = computed(() => tabs.find((tab) => tab.key === activeKey.value));
  let nextKey = 1;
  const activate = (tab: TextTab) => { if (tabs.includes(tab)) activeKey.value = tab.key; };
  const remove = (controller: TextController) => {
    const index = tabs.findIndex((tab) => tab.controller === controller);
    if (index < 0) return;
    const [tab] = tabs.splice(index, 1);
    if (tab!.key === activeKey.value) activeKey.value = tabs[Math.min(index, tabs.length - 1)]?.key;
  };
  const tabsToClose = (key: number, scope: TabCloseScope) => {
    const index = tabs.findIndex((tab) => tab.key === key);
    if (index < 0) return [];
    return scope === "current" ? [tabs[index]!] : scope === "left" ? tabs.slice(0, index) : tabs.slice(index + 1);
  };
  const open = async (path: string, encoding: string) => {
    const existing = tabs.find((tab) => pathKey(tab.controller.state.info!.path) === pathKey(path));
    if (existing) { activate(existing); return existing; }
    if (opening.value) throw new Error("Another file is still opening");
    if (tabs.length >= MAX_TEXT_TABS) throw new Error("Close a text tab before opening another file (maximum 8 tabs)");
    opening.value = true;
    try {
      const controller = createTextController(api);
      await controller.open(path, encoding);
      // 后端返回规范路径，避免相对路径、符号链接等别名重复打开同一文件。
      const duplicate = tabs.find((tab) => pathKey(tab.controller.state.info!.path) === pathKey(controller.state.info!.path));
      if (duplicate) { await controller.close(true); activate(duplicate); return duplicate; }
      const tab = { key: nextKey++, controller };
      tabs.push(tab); activate(tab); return tab;
    } finally { opening.value = false; }
  };
  return { tabs, activeKey, active, opening, activate, remove, tabsToClose, open };
}
export const textWorkspace = createTextWorkspace();
