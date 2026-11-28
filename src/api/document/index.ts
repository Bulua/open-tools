/**
 * 文档转换与字体读取后端 API 定义。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type { SystemFont } from "@/types/document";

export const documentApi = {
  async listSystemFonts(): Promise<SystemFont[]> {
    const res = await requestBackend<ApiResponsePayload<SystemFont[]>>("pdf_system_fonts");
    return unwrapApiResponse(res);
  },

  async readSystemFont(id: number): Promise<string> {
    const res = await requestBackend<ApiResponsePayload<string>>("pdf_system_font_read", { id });
    return unwrapApiResponse(res);
  },

  async officeEngines(): Promise<string[]> {
    const res = await requestBackend<ApiResponsePayload<string[]>>(
      "office_engines",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: [] }) },
    );
    return unwrapApiResponse(res);
  },

  officeToPdf(data: Uint8Array | ArrayBuffer, ext: string): Promise<ArrayBuffer> {
    return requestBackend<ArrayBuffer>("office_to_pdf", data, {
      headers: { "x-file-ext": ext },
    });
  },

  pdfToWord(data: Uint8Array | ArrayBuffer): Promise<ArrayBuffer> {
    return requestBackend<ArrayBuffer>("pdf_to_word", data);
  },

  wordToMarkdown(data: Uint8Array | ArrayBuffer, fileName: string): Promise<ArrayBuffer> {
    const encodedName = btoa(String.fromCharCode(...new TextEncoder().encode(fileName)));
    return requestBackend<ArrayBuffer>("word_to_markdown", data, {
      headers: { "x-file-ext": "docx", "x-file-name": encodedName },
    });
  },
};
