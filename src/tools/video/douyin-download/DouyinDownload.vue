<script setup lang="ts">
import SocialDownload from "../shared/components/SocialDownload.vue";
import { douyinAdapter } from "./adapter";
</script>

<template>
  <SocialDownload :adapter="douyinAdapter" />
</template>
