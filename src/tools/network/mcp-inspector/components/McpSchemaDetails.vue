<script setup lang="ts">
import { Braces, X } from "lucide-vue-next";
import { defineAsyncComponent, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { closePanelDialog, vPanelDismiss } from "@/utils/panelDialog";

defineProps<{ label: string; buttonLabel: string; schema: Record<string, unknown> }>();
const { t } = useI18n();
const CodeEditor = defineAsyncComponent(() => import("@/components/common/CodeEditor.vue"));
const labelId = useId();
const dialog = ref<HTMLDialogElement>();
const expanded = ref(false);

function open() {
  if (!dialog.value || dialog.value.open) return;
  dialog.value.showModal();
  expanded.value = true;
}
</script>

<template>
  <button type="button" class="btn small schema-button" :title="label" aria-haspopup="dialog" @click="open">
    <Braces :size="14" aria-hidden="true" />
    {{ buttonLabel }}
  </button>
  <dialog v-panel-dismiss ref="dialog" class="schema-dialog panel-dialog" :aria-labelledby="labelId" @cancel.prevent="closePanelDialog(dialog)" @close="expanded = false">
    <div class="schema-layout">
      <header>
        <h3 :id="labelId">{{ label }}</h3>
        <button type="button" class="icon-btn" :title="t('common.close')" :aria-label="t('common.close')" autofocus @click="closePanelDialog(dialog)">
          <X :size="18" aria-hidden="true" />
        </button>
      </header>
      <CodeEditor v-if="expanded" :model-value="JSON.stringify(schema, null, 2)" :labelled-by="labelId" language="json" readonly wrap />
    </div>
  </dialog>
</template>

<style scoped>
.schema-button { white-space: nowrap; }
.schema-dialog {
  width: min(760px, calc(100vw - 32px));
  max-width: none;
  height: min(600px, 80vh);
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}
.schema-dialog::backdrop { background: var(--modal-scrim); }
.schema-layout { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.schema-layout header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.schema-layout h3 { margin: 0; font-size: 15px; font-weight: 600; }
</style>
