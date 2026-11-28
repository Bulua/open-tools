import { systemApi } from "@/api/system";

/** 与日历共用 Windows Toast，仅在 Windows 桌面版发送。 */
export async function notifyDesktop(title: string, body: string): Promise<void> {
  await systemApi.desktopNotify(title, body);
}
