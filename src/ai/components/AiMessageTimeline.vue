<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { formatTimelineTime, type TimelineItem } from "../timeline";

const props = defineProps<{
  items: TimelineItem[];
  activeId: string;
}>();

const emit = defineEmits<{
  jump: [messageId: string];
}>();

const { t, locale } = useI18n();

const railRef = ref<HTMLElement>();
const popoverRef = ref<HTMLElement>();
const hoveredId = ref("");
const popoverPos = ref<{ left: number; top: number } | null>(null);
const animateTop = ref(false);

let closeTimer = 0;
let activeAnchorEl: HTMLElement | null = null;

const hoveredItem = computed<TimelineItem | null>(() => {
  if (!hoveredId.value) return null;
  return props.items.find((item) => item.id === hoveredId.value) ?? null;
});

const popoverStyle = computed((): Record<string, string> => {
  if (!popoverPos.value) return {};
  return {
    left: `${popoverPos.value.left}px`,
    top: `${popoverPos.value.top}px`,
  };
});

function clearCloseTimer() {
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    closeTimer = 0;
  }
}

function updatePopoverPosition(anchorEl: HTMLElement | null) {
  if (!anchorEl) return;
  const dotRect = anchorEl.getBoundingClientRect();
  const railRect = railRef.value?.getBoundingClientRect() ?? dotRect;
  const cardWidth = popoverRef.value?.offsetWidth || 320;
  const cardHeight = popoverRef.value?.offsetHeight || 124;
  const margin = 12;

  const rawLeft = railRect.right + 10;
  const left = Math.max(margin, Math.min(rawLeft, window.innerWidth - cardWidth - margin));

  const dotCenterY = dotRect.top + dotRect.height / 2;
  const rawTop = dotCenterY - cardHeight / 2;
  const top = Math.max(margin, Math.min(rawTop, window.innerHeight - cardHeight - margin));

  popoverPos.value = { left, top };
}

function showForDot(item: TimelineItem, anchorEl: HTMLElement) {
  clearCloseTimer();
  const wasOpen = Boolean(hoveredId.value);
  animateTop.value = wasOpen;
  activeAnchorEl = anchorEl;
  hoveredId.value = item.id;
  updatePopoverPosition(anchorEl);
  void nextTick(() => {
    if (popoverRef.value) popoverRef.value.inert = false;
    if (hoveredId.value === item.id && activeAnchorEl) {
      updatePopoverPosition(activeAnchorEl);
    }
  });
}

function closeNow() {
  clearCloseTimer();
  if (popoverRef.value) popoverRef.value.inert = true;
  hoveredId.value = "";
  activeAnchorEl = null;
  animateTop.value = false;
}

function scheduleClose() {
  clearCloseTimer();
  closeTimer = window.setTimeout(() => {
    closeNow();
  }, 90);
}

function onDotEnter(item: TimelineItem, event: MouseEvent | FocusEvent) {
  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;
  showForDot(item, el);
}

function onDotBlur(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (next && (railRef.value?.contains(next) || popoverRef.value?.contains(next))) return;
  scheduleClose();
}

function onDotClick(item: TimelineItem) {
  emit("jump", item.id);
  closeNow();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && hoveredId.value) {
    closeNow();
  }
}

function onWindowResize() {
  if (hoveredId.value && activeAnchorEl) {
    updatePopoverPosition(activeAnchorEl);
  }
}

watch(hoveredId, (id, prev) => {
  if (id && !prev) {
    document.addEventListener("keydown", onKeydown, true);
    window.addEventListener("resize", onWindowResize);
  } else if (!id && prev) {
    document.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("resize", onWindowResize);
  }
});

// 消息被删或切换会话后，若当前悬停节点已不存在则收起浮层
watch(
  () => props.items,
  (list) => {
    if (hoveredId.value && !list.some((item) => item.id === hoveredId.value)) {
      closeNow();
    }
  },
);

// 对话轮次很多时，确保当前激活的小点始终处于时间线可视区域内
watch(
  () => props.activeId,
  async (id) => {
    if (!id) return;
    await nextTick();
    const rail = railRef.value;
    if (!rail || rail.scrollHeight <= rail.clientHeight) return;
    const target = Array.from(rail.querySelectorAll<HTMLElement>("[data-timeline-id]")).find(
      (node) => node.dataset.timelineId === id,
    );
    if (!target) return;
    const top = target.offsetTop;
    const bottom = top + target.offsetHeight;
    if (top < rail.scrollTop) {
      rail.scrollTop = Math.max(0, top - 8);
    } else if (bottom > rail.scrollTop + rail.clientHeight) {
      rail.scrollTop = bottom - rail.clientHeight + 8;
    }
  },
);

onBeforeUnmount(() => {
  clearCloseTimer();
  document.removeEventListener("keydown", onKeydown, true);
  window.removeEventListener("resize", onWindowResize);
});
</script>

<template>
  <nav
    ref="railRef"
    class="message-timeline"
    :aria-label="t('ai.timelineNav')"
    @mouseenter="clearCloseTimer"
    @mouseleave="scheduleClose"
  >
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="timeline-dot-btn"
      :class="{ active: item.id === activeId, hovered: item.id === hoveredId }"
      :data-timeline-id="item.id"
      :aria-label="t('ai.timelineJumpTo', { index: item.index, total: items.length, text: item.promptPreview })"
      :aria-current="item.id === activeId ? 'location' : undefined"
      @mouseenter="onDotEnter(item, $event)"
      @focus="onDotEnter(item, $event)"
      @blur="onDotBlur"
      @click="onDotClick(item)"
    >
      <span class="timeline-dot" aria-hidden="true" />
    </button>
  </nav>

  <Teleport to="body">
    <Transition name="pop">
      <div
        v-if="hoveredItem"
        ref="popoverRef"
        class="timeline-popover"
        :class="{ 'follow-top': animateTop }"
        :style="popoverStyle"
        role="tooltip"
        @mouseenter="clearCloseTimer"
        @mouseleave="scheduleClose"
        @click="onDotClick(hoveredItem)"
      >
        <div class="popover-prompt">{{ hoveredItem.promptPreview }}</div>
        <div v-if="hoveredItem.replyPreview" class="popover-reply">{{ hoveredItem.replyPreview }}</div>
        <div class="popover-meta">
          <span>{{ t("ai.timelinePosition", { index: hoveredItem.index, total: items.length }) }}</span>
          <span v-if="hoveredItem.createdAt">{{ formatTimelineTime(hoveredItem.createdAt, locale) }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.message-timeline {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 4;
  max-height: calc(100% - 28px);
  padding: 6px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  scrollbar-width: none;
}
.message-timeline::-webkit-scrollbar {
  display: none;
}

.timeline-dot-btn {
  width: 22px;
  height: 14px;
  padding: 0;
  border: 0;
  background: none;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  cursor: pointer;
}
.timeline-dot-btn:focus-visible {
  outline: none;
}

.timeline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-3);
  opacity: 0.42;
  transition:
    transform var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out),
    opacity var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.timeline-dot-btn.active .timeline-dot {
  background: var(--text);
  opacity: 1;
}

.timeline-dot-btn:hover .timeline-dot,
.timeline-dot-btn.hovered .timeline-dot,
.timeline-dot-btn:focus-visible .timeline-dot {
  background: var(--text-2);
  opacity: 1;
  transform: scale(1.4);
}

.timeline-dot-btn.active:hover .timeline-dot,
.timeline-dot-btn.active.hovered .timeline-dot,
.timeline-dot-btn.active:focus-visible .timeline-dot {
  background: var(--text);
  opacity: 1;
  transform: scale(1.4);
}

.timeline-dot-btn:focus-visible .timeline-dot {
  box-shadow: 0 0 0 3px var(--accent-soft);
}
</style>

<style>
.timeline-popover {
  position: fixed;
  z-index: 120;
  width: min(328px, calc(100vw - 80px));
  padding: 13px 15px 11px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  user-select: none;
}
.timeline-popover.follow-top:not(.pop-enter-active):not(.pop-leave-active) {
  transition: top var(--dur-fast) var(--ease-out);
}

.timeline-popover .popover-prompt {
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--text);
  word-break: break-word;
  white-space: pre-line;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.timeline-popover .popover-reply {
  margin-top: 6px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
  word-break: break-word;
  white-space: pre-line;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.timeline-popover .popover-meta {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>
