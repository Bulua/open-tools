<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import TwoWayConvert from "@/components/tool/TwoWayConvert.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import ToolActions from "@/components/tool/ToolActions.vue";
import * as tf from "./transforms";

/** URL / Unicode / HTML 三种编码，在标题栏切换，双向实时转换 */
type Kind = "url" | "unicode" | "html";
const { t } = useI18n();

/** label 是标题栏按钮上的名称，right 是右侧文本框的标题（文案 key） */
const KINDS: Record<Kind, { label: string; right: string; encode: (s: string) => string; decode: (s: string) => string; example: string }> = {
  url: { label: "URL", right: "urlEncoded", encode: tf.urlEncode, decode: tf.urlDecode, example: "a%3D1%26b%3D%E5%B7%A5%E5%85%B7" },
  unicode: { label: "Unicode", right: "unicodeEncoded", encode: tf.unicodeEscape, decode: tf.unicodeUnescape, example: "\\u5de5\\u5177" },
  html: { label: "htmlEntity", right: "htmlEntity", encode: tf.htmlEscape, decode: tf.htmlUnescape, example: "&lt;div&gt;" },
};
/** 名称是文案 key 时翻译，URL、Unicode 原样显示 */
const labelOf = (s: string) => (/^[A-Z]/.test(s) ? s : t(`encode.${s}`));

const kind = useStoredRef<Kind>("text-escape.kind", "url");
const current = computed(() => KINDS[kind.value] ?? KINDS.url);
</script>

<template>
  <ToolActions>
    <div class="seg">
      <button v-for="(k, key) in KINDS" :key="key" :class="{ on: kind === key }" @click="kind = key">{{ labelOf(k.label) }}</button>
    </div>
  </ToolActions>

  <TwoWayConvert
    :left-label="t('encode.original')"
    :right-label="labelOf(current.right)"
    :encode="current.encode"
    :decode="current.decode"
    :left-placeholder="t('encode.originalPlaceholder')"
    :right-placeholder="t('encode.encodedPlaceholder', { example: current.example })"
  />
</template>
