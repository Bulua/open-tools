<script setup lang="ts">
import SocialDownload from "../shared/components/SocialDownload.vue";
import { xAdapter } from "./xDownload";
</script>

<template>
  <SocialDownload :adapter="xAdapter" />
</template>
