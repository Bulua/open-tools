import { Binary, Code2, Fingerprint, KeyRound, Languages, Link2, ShieldCheck } from "lucide-vue-next";
import type { Category } from "../types";
import * as t from "./transforms";

const encode: Category = {
  id: "encode",
  name: "编码 / 加密",
  tools: [
    {
      id: "base64",
      name: "Base64",
      desc: "文本与 Base64 互相转换",
      icon: Binary,
      actions: [
        { label: "编码", primary: true, run: t.base64Encode },
        { label: "解码", run: t.base64Decode },
      ],
    },
    {
      id: "url",
      name: "URL 编解码",
      desc: "对 URL 参数进行编码或解码",
      icon: Link2,
      actions: [
        { label: "编码", primary: true, run: encodeURIComponent },
        { label: "解码", run: decodeURIComponent },
      ],
    },
    {
      id: "unicode",
      name: "Unicode",
      desc: "中文与 \\uXXXX 互相转换",
      icon: Languages,
      actions: [
        { label: "转 Unicode", primary: true, run: t.unicodeEscape },
        { label: "转中文", run: t.unicodeUnescape },
      ],
    },
    {
      id: "html",
      name: "HTML 实体",
      desc: "HTML 特殊字符转义与反转义",
      icon: Code2,
      actions: [
        { label: "转义", primary: true, run: t.htmlEscape },
        { label: "反转义", run: t.htmlUnescape },
      ],
    },
    {
      id: "sha",
      name: "SHA 哈希",
      desc: "计算 SHA-1 / SHA-256 / SHA-512",
      icon: Fingerprint,
      actions: [
        { label: "SHA-256", primary: true, run: (s) => t.sha("SHA-256", s) },
        { label: "SHA-1", run: (s) => t.sha("SHA-1", s) },
        { label: "SHA-512", run: (s) => t.sha("SHA-512", s) },
      ],
    },
    { id: "md5", name: "MD5", desc: "计算文本 MD5 摘要", icon: ShieldCheck },
    { id: "jwt", name: "JWT 解析", desc: "解析 JWT 的 Header 与 Payload", icon: KeyRound },
  ],
};

export default encode;
