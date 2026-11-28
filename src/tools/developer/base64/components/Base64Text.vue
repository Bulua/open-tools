<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import TwoWayConvert from "@/components/tool/TwoWayConvert.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import ToolActions from "@/components/tool/ToolActions.vue";
import { base64ToText, textToBase64 } from "../../shared/base64";

/** 文本 ↔ Base64，双向实时转换 */
const { t } = useI18n();
const urlSafe = useStoredRef("base64.urlSafe", false);
const encode = computed(() => (text: string) => textToBase64(text, urlSafe.value));
</script>

<template>
  <ToolActions>
    <label class="check" :title="t('encode.urlSafeTitle')">
      <input v-model="urlSafe" type="checkbox" />{{ t("encode.urlSafe") }}
    </label>
  </ToolActions>

  <TwoWayConvert
    :left-label="t('encode.text')"
    right-label="Base64"
    :encode="encode"
    :decode="base64ToText"
    :left-placeholder="t('encode.textPlaceholder')"
    :right-placeholder="t('encode.base64Placeholder')"
  />
</template>
