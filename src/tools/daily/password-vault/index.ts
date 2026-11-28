import { defineAsyncComponent } from "vue";
import { BookLock } from "lucide-vue-next";
import type { Tool } from "@/tools/types";

const tool: Tool = {
  id: "password-vault",
  name: "密码本",
  desc: "保存自己的账号和密码，用主密码加密后存放在本机，忘记主密码无法找回",
  icon: BookLock,
  component: defineAsyncComponent(() => import("./PasswordVault.vue")),
};

export default tool;
