/**
 * 日历工具类型定义（与 Rust `calendar::store` 保持字段一致）。
 */

export interface CalendarNote {
  text: string;
  annual: boolean;
  /** 提醒时间，格式 `YYYY-MM-DD HH:MM:SS` */
  reminderAt?: string;
}

export type CalendarNotes = Record<string, CalendarNote>;

export interface CalendarNoteRecord extends CalendarNote {
  id: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarNoteUpsertInput {
  date: string;
  text: string;
  annual: boolean;
  /** 提醒时间，格式 `YYYY-MM-DD HH:MM:SS`，传 null 或留空表示当天全天提醒 */
  reminderAt?: string | null;
}
