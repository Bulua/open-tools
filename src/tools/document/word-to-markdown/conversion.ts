import { strFromU8, unzipSync } from "fflate";
import { documentApi } from "@/api/document";
import { t } from "@/locales";

export const MAX_WORD_BYTES = 64 * 1024 * 1024;

export interface WordMarkdownResult {
  data: Uint8Array;
  fileName: string;
  markdown: string;
  format: "markdown" | "zip";
}

/** 原生端统一返回正文与资源包；只解压正文，有图片时直接保留原 ZIP。 */
export async function convertDocx(file: File): Promise<WordMarkdownResult> {
  const data = new Uint8Array(await file.arrayBuffer());
  const archive = new Uint8Array(await documentApi.wordToMarkdown(data, file.name));
  let hasImages = false;
  const entries = unzipSync(archive, { filter: (entry) => {
    if (entry.name.startsWith("assets/") && !entry.name.endsWith("/")) hasImages = true;
    return !entry.name.includes("/") && entry.name.endsWith(".md");
  } });
  const main = Object.keys(entries)[0];
  if (!main) throw new Error(t("document.wordMarkdown.failed"));
  return {
    data: hasImages ? archive : entries[main],
    fileName: hasImages ? main.replace(/\.md$/, ".zip") : main,
    markdown: strFromU8(entries[main]),
    format: hasImages ? "zip" : "markdown",
  };
}
