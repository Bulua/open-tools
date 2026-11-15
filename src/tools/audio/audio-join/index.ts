import { defineAsyncComponent } from "vue";
import { ListMusic } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "audio-join",
  name: "音频拼接",
  desc: "把多段音频按顺序拼成一个，可以调整顺序、留空白",
  icon: ListMusic,
  component: defineAsyncComponent(() => import("./AudioJoin.vue")),
};

export default tool;
