<script setup lang="ts">
import SocialDownload from "../shared/components/SocialDownload.vue";
import { weiboAdapter } from "./weiboDownload";
</script>

<template>
  <SocialDownload :adapter="weiboAdapter" />
</template>
