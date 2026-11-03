import { defineModuleLocales } from "@/locales/types";

/** 文档模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    "word-to-pdf": { name: "Word to PDF", desc: "Convert with the Word / WPS installed on this computer so the layout matches the original; batch conversion" },
    "pdf-to-word": {
      name: "PDF to Word",
      desc: "Turn PDFs into editable Word documents — uses Microsoft Word when installed, otherwise the built-in converter; batch conversion",
    },
    "word-watermark": { name: "Add Watermark to Word", desc: "Add text or image watermarks to .docx files, the same as Word's own watermarks; batch processing" },
    "word-unwatermark": {
      name: "Remove Word Watermark",
      desc: "Find watermarks added by Word or WPS, plus homemade ones like WordArt or translucent images in headers, and remove the ones you check; batch processing",
    },
    "pdf-pages": { name: "PDF Page Editor", desc: "Delete, rotate and reorder PDF pages, or merge several PDFs into one" },
    "pdf-unwatermark": {
      name: "Remove PDF Watermark",
      desc: "Find watermarks added by Acrobat, WPS and others, plus diagonal, translucent or repeated text and image watermarks, and remove the ones you check; batch processing",
    },
  },
});
