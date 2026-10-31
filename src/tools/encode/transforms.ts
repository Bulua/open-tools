/** URL / Unicode / HTML 编码相关的纯函数，不依赖界面，便于测试（Base64 见 base64.ts） */

// ---------- URL ----------

export const urlEncode = (s: string) => encodeURIComponent(s);

export const urlDecode = (s: string) => {
  try {
    // 表单提交时空格会被编码成 +
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    throw new Error("不是合法的 URL 编码");
  }
};

// ---------- Unicode ----------

/** 非 ASCII 字符转成 \uXXXX（emoji 等会转成两段），ASCII 保持不变 */
export const unicodeEscape = (s: string) => {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code > 0x7e ? "\\u" + code.toString(16).padStart(4, "0") : s[i];
  }
  return out;
};

/** 支持 \uXXXX 与 \u{1F600} 两种写法 */
export const unicodeUnescape = (s: string) =>
  s
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// ---------- HTML ----------

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
