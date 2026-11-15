import { renderAsync } from "docx-preview";

/**
 * 没有安装 Word / WPS 时的备用方案：在隐藏的框架中排版文档，调用系统打印，选择「另存为 PDF」。
 * 排版由 docx-preview 完成，复杂文档与 Word 的效果可能有差异。
 */
export async function printDocx(data: Uint8Array): Promise<void> {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    "<!doctype html><html><head><meta charset='utf-8'><style>@page{margin:0}html,body{margin:0;padding:0}section.docx{margin:0!important;box-shadow:none!important;break-after:page}section.docx:last-child{break-after:auto}</style></head><body></body></html>",
  );
  doc.close();
  try {
    await renderAsync(data.slice(), doc.body, doc.head, {
      inWrapper: false,
      breakPages: true,
      experimental: true,
      renderHeaders: true,
      renderFooters: true,
      useBase64URL: true,
    });
    // 等图片加载完再打印
    await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))));
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
  } finally {
    setTimeout(() => frame.remove(), 1000);
  }
}
