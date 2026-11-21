<script setup lang="ts">
import { X } from "lucide-vue-next";
import { ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import AppSelect from "@/components/common/AppSelect.vue";
import type { ArgumentDraft, ToolField } from "../toolArguments";

defineProps<{
  fields: ToolField[];
  drafts: Map<string, ArgumentDraft>;
  errors: Map<string, "requiredField" | "invalidField">;
  submitted: boolean;
}>();
const emit = defineEmits<{ update: [name: string, value: ArgumentDraft | undefined] }>();
const { t } = useI18n();
const id = useId();
const touched = ref(new Set<string>());

function updateNumber(name: string, event: Event) {
  const input = event.target as HTMLInputElement;
  emit("update", name, input.validity.badInput ? "NaN" : input.value || undefined);
}

function clearField(name: string, controlId: string) {
  document.getElementById(controlId)?.focus();
  emit("update", name, undefined);
}

function describedBy(index: number) {
  return `${id}-help-${index} ${id}-error-${index}`;
}
</script>

<template>
  <div class="argument-form">
    <p v-if="!fields.length" class="hint">{{ t("network.mcp.noFormFields") }}</p>
    <div v-for="(field, index) in fields" :key="field.name" class="argument-field">
      <label :id="id + '-label-' + index" :for="id + '-' + index" class="field-label">
        <span>{{ field.label }}</span>
        <span v-if="field.required" class="required" aria-hidden="true">*</span>
      </label>
      <div class="field-main">
        <div class="field-control" :class="[field.kind, { 'can-clear': field.kind === 'text' && drafts.has(field.name) }]"
          :aria-invalid="(submitted || touched.has(field.name)) && errors.has(field.name) ? true : undefined">
          <input v-if="field.kind === 'boolean'" :id="id + '-' + index" class="file-check" type="checkbox"
            :checked="drafts.get(field.name) === 'true'" :indeterminate="drafts.get(field.name) === 'null'"
            :aria-describedby="describedBy(index)"
            @change="emit('update', field.name, String(($event.target as HTMLInputElement).checked))" />
          <AppSelect v-else-if="field.kind === 'choice'" :id="id + '-' + index"
            :model-value="drafts.get(field.name) ?? ''"
            :options="[{ value: '', label: t('network.mcp.unsetField') }, ...(field.choices ?? [])]"
            :aria-labelledby="id + '-label-' + index" :aria-describedby="describedBy(index)"
            @update:model-value="emit('update', field.name, $event || undefined)" />
          <textarea v-else-if="field.kind === 'json'" :id="id + '-' + index" class="field json-field" rows="3"
            :value="drafts.get(field.name) ?? ''" :aria-required="field.required" :aria-describedby="describedBy(index)"
            @blur="touched.add(field.name)"
            @input="emit('update', field.name, ($event.target as HTMLTextAreaElement).value || undefined)" />
          <input v-else-if="field.kind === 'number'" :id="id + '-' + index" class="field" type="number"
            :value="drafts.get(field.name) === 'null' || drafts.get(field.name) === 'NaN' ? '' : drafts.get(field.name)"
            :placeholder="drafts.get(field.name) === 'null' ? 'null' : undefined"
            :step="field.types.includes('integer') ? 1 : 'any'" :aria-required="field.required" :aria-describedby="describedBy(index)"
            @blur="touched.add(field.name)" @input="updateNumber(field.name, $event)" />
          <input v-else-if="field.kind === 'text'" :id="id + '-' + index" class="field" type="text"
            :value="drafts.get(field.name) ?? ''" :placeholder="drafts.get(field.name) === null ? 'null' : undefined"
            :aria-required="field.required" :aria-describedby="describedBy(index)"
            @blur="touched.add(field.name)" @input="emit('update', field.name, ($event.target as HTMLInputElement).value || undefined)" />
          <button v-if="field.kind === 'text' && drafts.has(field.name)" type="button" class="icon-btn field-clear"
            :title="t('common.clear')" :aria-label="t('network.mcp.clearField', { name: field.label })"
            @click="clearField(field.name, id + '-' + index)">
            <X :size="14" aria-hidden="true" />
          </button>
        </div>
        <span v-if="(submitted || touched.has(field.name)) && errors.has(field.name)"
          :id="id + '-error-' + index" class="error" role="alert">{{ t('network.mcp.' + errors.get(field.name)) }}</span>
      </div>
      <div :id="id + '-help-' + index" class="field-help">
        <span v-if="field.description">{{ field.description }}</span>
        <code v-if="field.kind === 'boolean' && drafts.get(field.name) === 'null'">null</code>
      </div>
    </div>
  </div>
</template>

<style scoped>
.argument-form { display: grid; gap: 12px; }
.argument-field { display: grid; grid-template-columns: var(--argument-columns); align-items: start; gap: 4px var(--argument-column-gap); min-width: 0; }
.field-label { display: flex; align-items: baseline; justify-content: flex-end; gap: 4px; padding-block: 8px; font-size: 13px; font-weight: 600; text-align: end; overflow-wrap: anywhere; }
.field-main { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.field-control { position: relative; flex: none; width: calc(100% - var(--argument-warning-space)); min-width: 0; }
.field-control.boolean { display: flex; align-items: center; width: auto; min-height: 34px; }
.field-control.number { max-width: 176px; }
.field-clear { position: absolute; inset-inline-end: 5px; top: 5px; width: 24px; height: 24px; cursor: pointer; }
.can-clear > .field { padding-inline-end: 34px; }
.field { width: 100%; min-height: 34px; font-size: 13px; }
.json-field { display: block; height: auto; min-height: 64px; padding: 7px 12px; resize: vertical; font-family: var(--font-mono); }
.required, .error { color: var(--danger); }
.error { min-width: 0; padding-top: 8px; font-size: 12px; overflow-wrap: anywhere; }
.field-help { grid-column: 2; display: grid; gap: 4px; font-size: 12px; color: var(--text-2); overflow-wrap: anywhere; }
.field-help:empty { display: none; }
.hint { margin: 0; padding-block: 4px; color: var(--text-2); font-size: 13px; text-align: center; }
[aria-invalid="true"] > .field, [aria-invalid="true"] :deep(.select-trigger) { border-color: var(--danger); }
@container mcp-details (max-width: 460px) {
  .field-main { flex-direction: column; gap: 4px; }
  .error { padding-top: 0; }
}
@container mcp-details (max-width: 340px) {
  .field-label { justify-content: flex-start; padding-block: 0; text-align: start; }
  .field-help { grid-column: 1; }
  .field-control.boolean { min-height: 22px; }
}
</style>
