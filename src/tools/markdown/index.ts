import type { Category } from "../types";
import markdownEditor from "./markdown-editor";
import markdownToWord from "./markdown-to-word";
import notebook from "./notebook";

const markdown: Category = {
  id: "markdown",
  name: "Markdown",
  tools: [markdownEditor, markdownToWord, notebook],
};

export default markdown;
