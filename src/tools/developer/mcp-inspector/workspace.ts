import { ref, shallowReactive, shallowRef } from "vue";
import type { McpConnectionItem } from "@/types/mcp";
import type { McpServerInfo } from "./config";

export type McpConnection = McpConnectionItem;

// 配置由后端持久保存，已建立的会话只在应用运行期间保留。
export const connections = shallowRef<McpConnection[]>([]);
export type McpSession =
  | { status: "connecting" | "disconnecting"; sessionId: string }
  | { status: "connected"; sessionId: string; info: McpServerInfo }
  | { status: "failed" };
export const sessions = shallowReactive(new Map<string, McpSession>());
export const testing = ref(false);
