import { defineAsyncComponent } from "vue";
import { Webcam } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "camera-recorder",
  platforms: ["desktop", "web"],
  name: "摄像头录制",
  desc: "用摄像头录一段视频，可同时录麦克风，录完预览并保存",
  icon: Webcam,
  component: defineAsyncComponent(() => import("./VideoRecorder.vue")),
};

export default tool;
