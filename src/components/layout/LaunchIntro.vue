<script setup lang="ts">
import AppLogo from "./AppLogo.vue";
import happy from "@/assets/mascot/cat-happy.webp";
import happyStill from "@/assets/mascot/cat-happy.png";
import sleep from "@/assets/mascot/cat-sleep.webp";
import sleepStill from "@/assets/mascot/cat-sleep.png";
import squeeze from "@/assets/mascot/cat-squeeze.webp";
import squeezeStill from "@/assets/mascot/cat-squeeze.png";
import thinking from "@/assets/mascot/cat-thinking.webp";
import thinkingStill from "@/assets/mascot/cat-thinking.png";
import walk from "@/assets/mascot/cat-walk.webp";
import walkStill from "@/assets/mascot/cat-walk.png";

defineProps<{ leaving: boolean }>();

const cats = [
  { animated: happy, still: happyStill },
  { animated: sleep, still: sleepStill },
  { animated: squeeze, still: squeezeStill },
  { animated: thinking, still: thinkingStill },
  { animated: walk, still: walkStill },
];
</script>

<template>
  <div class="launch-intro" :class="{ leaving }" aria-hidden="true">
    <div class="content">
      <div class="brand">
        <AppLogo :size="48" />
        <span>Open Tools</span>
      </div>
      <div class="cats">
        <picture v-for="(cat, index) in cats" :key="index">
          <source media="(prefers-reduced-motion: reduce)" :srcset="cat.still" />
          <img :src="cat.animated" alt="" width="160" height="152" draggable="false" />
        </picture>
      </div>
    </div>
  </div>
</template>

<style scoped>
@property --launch-reveal {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}
.launch-intro {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  background: var(--bg);
  clip-path: inset(0 0 0 0);
  transition: clip-path 1500ms var(--ease-out);
}
.launch-intro.leaving {
  clip-path: inset(0 100% 0 0);
}
@supports (mask-image: radial-gradient(circle, transparent, black)) {
  .launch-intro {
    --launch-reveal: 0px;
    mask-image: radial-gradient(circle at center, transparent var(--launch-reveal), #000 calc(var(--launch-reveal) + 1px));
    transition: --launch-reveal 1500ms var(--ease-out);
  }
  .launch-intro.leaving {
    --launch-reveal: 100vmax;
    clip-path: inset(0);
  }
}
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 44px;
  max-width: 100%;
  padding: 24px 16px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--text);
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 500;
}
.cats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.cats picture {
  display: block;
  flex: 0 0 160px;
  width: 160px;
  height: 152px;
}
.cats img {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
@media (max-width: 879px) {
  .cats picture {
    flex-basis: 80px;
    width: 80px;
    height: 76px;
  }
}
@media (max-width: 479px) {
  .cats {
    gap: 8px;
  }
  .cats picture {
    flex-basis: 40px;
    width: 40px;
    height: 38px;
  }
}
</style>
