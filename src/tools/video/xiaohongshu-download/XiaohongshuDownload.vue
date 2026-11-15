<script setup lang="ts">
import SocialDownload from "../shared/components/SocialDownload.vue";
import { xiaohongshuAdapter } from "./adapter";
</script>

<template>
  <SocialDownload :adapter="xiaohongshuAdapter" />
</template>
