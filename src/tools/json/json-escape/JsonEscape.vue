<script setup lang="ts">
import { computed } from "vue";
import TextTransform from "@/components/tool/TextTransform.vue";
import { locale } from "@/locales";
import { localizeTool } from "@/locales/tools";
import tool from "./index";

const localized = computed(() => localizeTool(tool, locale.value));
</script>

<template>
  <TextTransform :actions="localized.actions!" :placeholder="localized.inputPlaceholder" />
</template>
