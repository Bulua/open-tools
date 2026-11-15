import { defineAsyncComponent } from "vue";
import { KeySquare } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "password",
  name: "随机密码生成",
  desc: "自定义字符种类、长度和字符集，使用安全随机数，可批量生成",
  icon: KeySquare,
  component: defineAsyncComponent(() => import("./PasswordGenerator.vue")),
};

export default tool;
