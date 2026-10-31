import type { Component } from "vue";
import {
  Braces,
  Lock,
  ArrowLeftRight,
  Binary,
  Link2,
  Languages,
  Code2,
  Fingerprint,
  ShieldCheck,
  KeyRound,
  Clock,
  Hash,
  Palette,
  CaseSensitive,
} from "lucide-vue-next";

/** 工具的一个操作按钮，例如“编码”“解码” */
export interface ToolAction {
  label: string;
  primary?: boolean;
  run: (input: string) => string | Promise<string>;
}

export interface Tool {
  id: string;
  name: string;
  desc: string;
  icon: Component;
  /** 未提供 actions 的工具显示为“开发中” */
  actions?: ToolAction[];
  inputPlaceholder?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: Component;
  tools: Tool[];
}

const utf8ToBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};

const base64ToUtf8 = (s: string) => {
  const bin = atob(s.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const sha = async (algo: string, s: string) => {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const htmlEscape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const htmlUnescape = (s: string) => {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
};

export const categories: Category[] = [
  {
    id: "json",
    name: "Json 工具",
    icon: Braces,
    tools: [],
  },
  {
    id: "encode",
    name: "编码 / 加密",
    icon: Lock,
    tools: [
      {
        id: "base64",
        name: "Base64",
        desc: "文本与 Base64 互相转换",
        icon: Binary,
        actions: [
          { label: "编码", primary: true, run: utf8ToBase64 },
          { label: "解码", run: base64ToUtf8 },
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
          {
            label: "转 Unicode",
            primary: true,
            run: (s) => [...s].map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).join(""),
          },
          {
            label: "转中文",
            run: (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
          },
        ],
      },
      {
        id: "html",
        name: "HTML 实体",
        desc: "HTML 特殊字符转义与反转义",
        icon: Code2,
        actions: [
          { label: "转义", primary: true, run: htmlEscape },
          { label: "反转义", run: htmlUnescape },
        ],
      },
      {
        id: "sha",
        name: "SHA 哈希",
        desc: "计算 SHA-1 / SHA-256 / SHA-512",
        icon: Fingerprint,
        actions: [
          { label: "SHA-256", primary: true, run: (s) => sha("SHA-256", s) },
          { label: "SHA-1", run: (s) => sha("SHA-1", s) },
          { label: "SHA-512", run: (s) => sha("SHA-512", s) },
        ],
      },
      { id: "md5", name: "MD5", desc: "计算文本 MD5 摘要", icon: ShieldCheck },
      { id: "jwt", name: "JWT 解析", desc: "解析 JWT 的 Header 与 Payload", icon: KeyRound },
    ],
  },
  {
    id: "convert",
    name: "转换",
    icon: ArrowLeftRight,
    tools: [
      { id: "timestamp", name: "时间戳", desc: "Unix 时间戳与日期互转", icon: Clock },
      { id: "radix", name: "进制转换", desc: "二、八、十、十六进制互转", icon: Hash },
      { id: "color", name: "颜色转换", desc: "HEX / RGB / HSL 互转", icon: Palette },
      {
        id: "case",
        name: "大小写转换",
        desc: "大写、小写、驼峰、下划线",
        icon: CaseSensitive,
        actions: [
          { label: "大写", primary: true, run: (s) => s.toUpperCase() },
          { label: "小写", run: (s) => s.toLowerCase() },
          {
            label: "驼峰",
            run: (s) => s.toLowerCase().replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")),
          },
          {
            label: "下划线",
            run: (s) =>
              s
                .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
                .replace(/[-\s]+/g, "_")
                .toLowerCase(),
          },
        ],
      },
    ],
  },
];
