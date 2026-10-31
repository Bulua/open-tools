/** 「插入示例」的内容：展示支持的语法 */
export const SAMPLE_MARKDOWN = `# 项目说明

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
