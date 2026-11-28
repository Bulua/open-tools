import type { Category } from "../types";
import largeFile from "./large-file";
import wordToPdf from "./word-to-pdf";
import wordToMarkdown from "./word-to-markdown";
import pdfToWord from "./pdf-to-word";
import wordWatermark from "./word-watermark";
import wordUnwatermark from "./word-unwatermark";
import pdfEditor from "./pdf-content-editor";
import pdfPages from "./pdf-page-manager";
import pdfUnwatermark from "./pdf-unwatermark";
import markdownToWord from "./markdown-to-word";
import archive from "./archive";
import extract from "./extract";

const document: Category = {
  id: "document",
  name: "文档与文件",
  tools: [
    largeFile,
    wordToPdf,
    wordToMarkdown,
    pdfToWord,
    wordWatermark,
    wordUnwatermark,
    pdfEditor,
    pdfPages,
    pdfUnwatermark,
    markdownToWord,
    archive,
    extract,
  ],
};

export default document;
