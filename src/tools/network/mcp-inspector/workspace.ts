import { ref, shallowRef } from "vue";
import type { McpConfig } from "./config";

export interface McpConnection {
  id: string;
  name: string;
  config: McpConfig;
}

// 请求头和环境变量可能含凭据，连接只在应用运行期间保存。
export const connections = shallowRef<McpConnection[]>([]);
export const testing = ref(false);
