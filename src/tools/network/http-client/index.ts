import { defineAsyncComponent } from "vue";
import { Send } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "http-client",
  name: "HTTP 请求",
  desc: "发送 GET、POST 等任意请求，支持请求头、认证、JSON、表单、文件上传；响应可预览 JSON、网页、图片、音视频、PDF，也能保存为文件",
  icon: Send,
  component: defineAsyncComponent(() => import("./HttpClient.vue")),
  sessions: true,
};

export default tool;
