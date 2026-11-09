import type { Component } from "vue";
import type { AppPlatform } from "@/utils/platform";

/** 文本转换工具的一个操作按钮，例如「编码」「解码」 */
export interface ToolAction {
  label: string;
  /** 主操作按钮（实心强调色） */
  primary?: boolean;
  run: (input: string) => string | Promise<string>;
}

/**
 * 一个工具。界面三选一：
 * - component：自定义界面（复杂工具，如 JSON 对比）
 * - actions：通用文本转换界面（简单工具，如 Base64）
 * - 都不提供：显示「即将上线」
 */
export interface Tool {
  /** 唯一标识，用于记住上次打开的工具 */
  id: string;
  name: string;
  /** 一句话说明，显示在标题下方和搜索结果中 */
  desc: string;
  /** lucide-vue-next 图标 */
  icon: Component;
  component?: Component;
  /** 传给 component 的属性：同一个界面组件可以按不同用途注册成多个工具 */
  props?: Record<string, unknown>;
  actions?: ToolAction[];
  inputPlaceholder?: string;
  /** 支持多会话：同一个工具可以开多个标签，各自独立输入和处理 */
  sessions?: boolean;
  /** 可显示的平台，省略时在所有平台显示。 */
  platforms?: readonly AppPlatform[];
}

/** 顶部的一个分类 */
export interface Category {
  id: string;
  name: string;
  tools: Tool[];
}

/** 工具是否已经可以使用 */
export const isAvailable = (tool: Tool) => Boolean(tool.component || tool.actions);
