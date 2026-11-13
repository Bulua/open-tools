/** 「插入示例」的内容：展示支持的语法 */
export const SAMPLE_MARKDOWN_ZH = `# 项目说明

这是一段 **Markdown** 示例，左侧编辑，右侧*实时*预览。支持 ~~删除线~~、\`行内代码\` 和 [链接](https://github.com/Bulua/open-tools)。

## 功能列表

- 实时预览，代码块自动高亮
- 支持表格、任务列表
  - 列表可以嵌套
- 可导出为 Word 或 HTML

1. 第一步：编写内容
2. 第二步：检查预览
3. 第三步：导出文件

## 待办

- [x] 完成初稿
- [ ] 校对内容

## 表格

| 工具 | 说明 | 状态 |
| :--- | :--- | :---: |
| Markdown 预览 | 实时渲染 | ✓ |
| Markdown 转 Word | 批量转换 | ✓ |

## 代码

\`\`\`ts
function greet(name: string): string {
  return \`你好，\${name}\`;
}
\`\`\`

> 引用：好的文档和好的代码一样重要。

---

最后一段正文。
`;

export const SAMPLE_MARKDOWN_EN = `# About the Project

This is a **Markdown** sample — edit on the left, see a *live* preview on the right. It supports ~~strikethrough~~, \`inline code\` and [links](https://github.com/Bulua/open-tools).

## Features

- Live preview with code highlighting
- Tables and task lists
  - Lists can be nested
- Export to Word or HTML

1. Step one: write the content
2. Step two: check the preview
3. Step three: export the file

## To Do

- [x] Finish the first draft
- [ ] Proofread

## Table

| Tool | Description | Status |
| --- | --- | :---: |
| Markdown Preview | Live rendering | ✓ |
| Markdown to Word | Batch conversion | ✓ |

## Code

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}\`;
}
\`\`\`

> Quote: good docs matter as much as good code.

---

The last paragraph.
`;

/** 各语言的示例文档；没有的语言用英文示例 */
const SAMPLES: Record<string, string> = { "zh-CN": SAMPLE_MARKDOWN_ZH, en: SAMPLE_MARKDOWN_EN };
export const sampleMarkdown = (locale: string) => SAMPLES[locale] ?? SAMPLE_MARKDOWN_EN;
