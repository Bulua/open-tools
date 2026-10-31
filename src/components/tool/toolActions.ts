import { inject, ref, type InjectionKey, type Ref } from "vue";

/**
 * 工具标题栏右侧选项区的选择器。
 * 工具组件用 <Teleport defer :to="TOOL_ACTIONS"> 把自己的选项（模式切换、复选框等）放进标题栏。
 * 支持多会话的工具，请给 Teleport 加上 v-if="active"（见 useToolActive），只让当前会话显示选项。
 */
export const TOOL_ACTIONS = "#tool-actions";

/** 当前会话是否正在显示（多会话时，后台会话为 false） */
export const TOOL_ACTIVE: InjectionKey<Ref<boolean>> = Symbol("tool-active");

/** 当前工具实例是否处于显示状态；不在会话中使用时始终为 true */
export function useToolActive(): Ref<boolean> {
  return inject(TOOL_ACTIVE, ref(true));
}
