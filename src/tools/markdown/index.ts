import type { Category } from "../types";
import markdownEditor from "./markdown-editor";
import markdownToWord from "./markdown-to-word";

const markdown: Category = {
  id: "markdown",
  name: "Markdown",
  tools: [markdownEditor, markdownToWord],
};

export default markdown;
