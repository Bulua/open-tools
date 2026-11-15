import { defineAsyncComponent } from "vue";
import { Scissors } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "video-trim",
  name: "视频裁剪",
  desc: "拖动时间轴保留需要的一段，也可以框选画面区域、改成 16:9、9:16 等比例；只裁时长时不重新编码，快且无损",
  icon: Scissors,
  component: defineAsyncComponent(() => import("./VideoTrim.vue")),
};

export default tool;
