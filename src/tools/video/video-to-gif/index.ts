import { defineAsyncComponent } from "vue";
import { FileImage } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "video-to-gif",
  name: "视频转 GIF",
  desc: "把整段视频转成 GIF 动图，可设置帧率、宽度、颜色数和是否循环，在本机处理不上传",
  icon: FileImage,
  component: defineAsyncComponent(() => import("./VideoToGif.vue")),
};

export default tool;
