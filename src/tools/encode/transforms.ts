/** 编码 / 加密相关的纯函数，不依赖界面，便于测试 */

export const base64Encode = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};

export const base64Decode = (s: string) => {
  const bin = atob(s.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export const unicodeEscape = (s: string) =>
  [...s].map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).join("");

export const unicodeUnescape = (s: string) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const htmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);

export const htmlUnescape = (s: string) => {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
};

export const sha = async (algorithm: "SHA-1" | "SHA-256" | "SHA-512", s: string) => {
  const buf = await crypto.subtle.digest(algorithm, new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
