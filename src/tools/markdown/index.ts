import type { Category } from "../types";
import markdownToWord from "./markdown-to-word";
import notebook from "./notebook";

const markdown: Category = {
  id: "markdown",
  name: "Markdown",
  tools: [markdownToWord, notebook],
};

export default markdown;
