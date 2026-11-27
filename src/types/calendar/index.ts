/**
 * 日历工具类型定义（与 Rust `calendar::store` 保持字段一致）。
 */

export interface CalendarNote {
  text: string;
  annual: boolean;
  reminderTime?: string;
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
  reminderTime?: string | null;
}
