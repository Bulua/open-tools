/**
 * 日历后端 API 定义（统一经由 `requestBackend` 与 `unwrapApiResponse` 处理 `{ code, msg, data }`）。
 */
import { requestBackend, unwrapApiResponse } from "@/api/common";
import type { CalendarNoteRecord, CalendarNoteUpsertInput } from "@/types/calendar";
import type { ApiResponsePayload } from "@/types/common";

export const calendarApi = {
  async listNotes(): Promise<CalendarNoteRecord[]> {
    const res = await requestBackend<ApiResponsePayload<CalendarNoteRecord[]>>(
      "calendar_list_notes",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: [] }) },
    );
    return unwrapApiResponse(res);
  },

  async upsertNote(input: CalendarNoteUpsertInput): Promise<CalendarNoteRecord> {
    const res = await requestBackend<ApiResponsePayload<CalendarNoteRecord>>(
      "calendar_upsert_note",
      { input },
    );
    return unwrapApiResponse(res);
  },

  async deleteNote(date: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>(
      "calendar_delete_note",
      { date },
    );
    unwrapApiResponse(res);
  },

  async wait(delayMs: number, revision: number): Promise<number> {
    const res = await requestBackend<ApiResponsePayload<number>>(
      "calendar_wait",
      { delayMs, revision },
    );
    return unwrapApiResponse(res);
  },

  async wake(): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>("calendar_wake");
    unwrapApiResponse(res);
  },

  async notify(title: string, body: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>(
      "calendar_notify",
      { title, body },
    );
    unwrapApiResponse(res);
  },
};
