import { defineModuleLocales } from "@/locales/types";

/** Markdown 模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    "markdown-editor": {
      name: "Markdown Editor",
      desc: "Edit on the left with a live preview on the right; tables, task lists and code highlighting; export to Word and HTML",
    },
    "markdown-to-word": { name: "Markdown to Word", desc: "Convert .md files to Word documents in bulk, keeping headings, lists, tables, code blocks and images" },
  },
});
