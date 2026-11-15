import { defineAsyncComponent } from "vue";
import { Clapperboard } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "video-concat",
  name: "视频拼接",
  desc: "把多段视频按顺序拼成一个 MP4；格式相同时直接拼接，不重新编码，速度快、画质无损",
  icon: Clapperboard,
  component: defineAsyncComponent(() => import("./VideoConcat.vue")),
};

export default tool;
