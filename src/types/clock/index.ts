/**
 * 时钟工具类型定义（与 Rust `clock::store::CountdownItem` 保持字段一致）。
 */

export type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface AlarmSchedule {
  time: string;
  /** 星期日为 0，星期一到星期六为 1～6；空数组表示仅提醒一次。 */
  weekdays: number[];
}

export interface CountdownItem {
  id: string;
  title: string;
  /** 区分自动名称和用户输入；旧数据没有此标记。 */
  defaultTitle?: boolean;
  /** 到期时刻（毫秒时间戳） */
  target: number;
  /** 创建时间（`YYYY-MM-DD HH:MM:SS`） */
  createdAt: string;
  /** 更新时间（`YYYY-MM-DD HH:MM:SS`） */
  updatedAt?: string;
  /** 计时器的总时长（毫秒）；到指定时间的倒计时没有 */
  duration?: number;
  /** 暂停时剩余的毫秒数 */
  pausedRemaining?: number;
  repeat: Repeat;
  /** 已经提醒过 */
  done: boolean;
  alarm?: AlarmSchedule;
  enabled?: boolean;
}
