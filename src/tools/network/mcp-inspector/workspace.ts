import { ref, shallowReactive, shallowRef } from "vue";
import type { McpConfig, McpServerInfo } from "./config";

export interface McpConnection {
  id: string;
  name: string;
  config: McpConfig;
}

// 配置由后端持久保存，已建立的会话只在应用运行期间保留。
export const connections = shallowRef<McpConnection[]>([]);
export type McpSession =
  | { status: "connecting" | "disconnecting"; sessionId: string }
  | { status: "connected"; sessionId: string; info: McpServerInfo }
  | { status: "failed"; error: string };
export const sessions = shallowReactive(new Map<string, McpSession>());
export const testing = ref(false);
