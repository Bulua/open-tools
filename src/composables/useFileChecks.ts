import { computed, ref, type Ref } from "vue";

/**
 * 批量处理时每个文件前的复选框：勾选的才处理、下载。新添加的文件默认勾选。
 * 记录的是没勾选的文件 id，列表是 shallowRef 时也能正常更新。
 */
export function useFileChecks<T extends { id: number }>(items: Ref<T[]>) {
  const unchecked = ref<number[]>([]);
  const isChecked = (item: T) => !unchecked.value.includes(item.id);
  const toggle = (item: T) => {
    unchecked.value = isChecked(item) ? [...unchecked.value, item.id] : unchecked.value.filter((id) => id !== item.id);
  };
  const checkedItems = computed(() => items.value.filter(isChecked));
  const allChecked = computed(() => items.value.length > 0 && checkedItems.value.length === items.value.length);
  /** 只勾选了一部分：全选框显示为半选 */
  const partlyChecked = computed(() => checkedItems.value.length > 0 && !allChecked.value);
  const toggleAll = () => {
    unchecked.value = allChecked.value ? items.value.map((i) => i.id) : [];
  };
  return { isChecked, toggle, checkedItems, allChecked, partlyChecked, toggleAll };
}
