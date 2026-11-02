import { defineAsyncComponent } from "vue";
import { Binary, BookLock, Fingerprint, KeyRound, KeySquare, Link2 } from "lucide-vue-next";
import type { Category } from "../types";

const encode: Category = {
  id: "encode",
  name: "编码 / 加密",
  tools: [
    {
      id: "base64",
      name: "Base64 编解码",
      desc: "文本、图片、任意文件与 Base64 互相转换，解码后可下载",
      icon: Binary,
      component: defineAsyncComponent(() => import("./components/Base64.vue")),
    },
    {
      id: "text-escape",
      name: "URL/Unicode/HTML 编码",
      desc: "URL 参数编码、中文转 \\uXXXX、HTML 特殊字符转义，双向实时转换",
      icon: Link2,
      component: defineAsyncComponent(() => import("./components/TextEscape.vue")),
    },
    {
      id: "hash",
      name: "哈希计算（MD5 / SHA）",
      desc: "计算文本或文件的 MD5、SHA-1、SHA-256、SHA-512",
      icon: Fingerprint,
      component: defineAsyncComponent(() => import("./components/HashCalc.vue")),
    },
    {
      id: "jwt",
      name: "JWT 解码",
      desc: "查看 JWT 的 Header、Payload 和过期时间",
      icon: KeyRound,
      component: defineAsyncComponent(() => import("./components/JwtDecode.vue")),
    },
    {
      id: "password",
      name: "随机密码生成",
      desc: "自定义字符种类、长度和字符集，使用安全随机数，可批量生成",
      icon: KeySquare,
      component: defineAsyncComponent(() => import("./components/PasswordGenerator.vue")),
    },
    {
      id: "password-vault",
      name: "密码本",
      desc: "保存自己的账号和密码，用主密码加密后存放在本机，忘记主密码无法找回",
      icon: BookLock,
      component: defineAsyncComponent(() => import("./components/PasswordVault.vue")),
    },
  ],
};

export default encode;
