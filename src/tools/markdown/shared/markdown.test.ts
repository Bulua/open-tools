import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { renderMarkdown, slugify } from "./render";
import { docxNameOf, markdownToDocx } from "./toDocx";

describe("Markdown 渲染", () => {
  it("标题生成唯一 id 并收集目录", () => {
    const { html, headings } = renderMarkdown("# 简介\n\n## Hello World!\n\n## 简介");
    expect(headings.map((h) => h.id)).toEqual(["简介", "hello-world", "简介-1"]);
    expect(html).toContain('<h2 id="hello-world">Hello World!</h2>');
    expect(slugify("  API 说明（v2） ")).toBe("api-说明v2");
  });

  it("GFM：表格、任务列表、删除线", () => {
    const { html } = renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] 完成\n- [ ] 未完成\n\n~~删除~~");
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<del>删除</del>");
  });

  it("代码块高亮并标注语言，未知语言只转义", () => {
    expect(renderMarkdown("```js\nconst a = 1;\n```").html).toContain('class="hljs language-js"');
    expect(renderMarkdown("```\n<b>\n```").html).toContain("&lt;b&gt;");
  });
});

const documentXml = async (md: string) => strFromU8(unzipSync(await markdownToDocx(md))["word/document.xml"]);

describe("Markdown 转 Word", () => {
  it("标题使用 Word 标题样式，行内格式正确", async () => {
    const xml = await documentXml("# 标题\n\n正文 **粗体** *斜体* `code` [链接](https://example.com)");
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("<w:i/>");
    expect(xml).toContain("Consolas");
    expect(xml).toContain("<w:hyperlink");
  });

  it("列表、表格、代码块、引用", async () => {
    const xml = await documentXml("1. 一\n2. 二\n   - 子项\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```\nline1\nline2\n```\n\n> 引用");
    expect(xml.match(/<w:numPr>/g)?.length).toBe(3);
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("line2");
    expect(xml).toContain("引用");
  });

  it("任务列表与无法读取的图片", async () => {
    const xml = await documentXml("- [x] 已完成\n\n![示意图](a.png)");
    expect(xml).toContain("☑ ");
    expect(xml).toContain("[图片：示意图]");
  });

  it("文件名", () => {
    expect(docxNameOf("说明.md")).toBe("说明.docx");
    expect(docxNameOf("README.markdown")).toBe("README.docx");
  });
});
