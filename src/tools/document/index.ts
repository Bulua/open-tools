import type { Category } from "../types";
import wordToPdf from "./word-to-pdf";
import pdfToWord from "./pdf-to-word";
import wordWatermark from "./word-watermark";
import wordUnwatermark from "./word-unwatermark";
import pdfPages from "./pdf-pages";
import pdfUnwatermark from "./pdf-unwatermark";

const document: Category = {
  id: "document",
  name: "文档",
  tools: [wordToPdf, pdfToWord, wordWatermark, wordUnwatermark, pdfPages, pdfUnwatermark],
};

export default document;
