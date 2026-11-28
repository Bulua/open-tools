import { defineAsyncComponent } from "vue";
import { KeyRound } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "jwt",
  name: "JWT 解码",
  desc: "查看 JWT 的 Header、Payload 和过期时间",
  icon: KeyRound,
  component: defineAsyncComponent(() => import("./JwtDecode.vue")),
};

export default tool;
