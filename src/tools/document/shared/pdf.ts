import { PDFDocument } from "pdf-lib";
import { t } from "@/locales";
export async function loadPdf(data: Uint8Array) {
  try {
    return await PDFDocument.load(data, { updateMetadata: false });
  } catch (e) {
    if (e instanceof Error && /encrypt/i.test(e.message)) throw new Error(t("document.encrypted"));
    throw new Error(t("document.badPdf"));
  }
}
