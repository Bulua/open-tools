/**
 * MCP 后端 API 定义（独立模块，供 AI 助手与 MCP 工具查看器共同复用）。
 */
import { requestBackend, subscribeBackendEvent } from "@/api/common";
import type { McpConnectionItem, McpRemoteTool, McpServerConfig } from "@/types/mcp";

export const mcpApi = {
  readConnections(): Promise<McpConnectionItem[]> {
    return requestBackend<McpConnectionItem[]>("mcp_read_connections");
  },

  saveConnections(connections: McpConnectionItem[]): Promise<void> {
    return requestBackend<void>("mcp_save_connections", { connections });
  },

  activeSessions(): Promise<string[]> {
    return requestBackend<string[]>("mcp_active_sessions", undefined, { fallback: () => [] });
  },

  connect(sessionId: string, config: McpServerConfig): Promise<void> {
    return requestBackend<void>("mcp_connect", { sessionId, config });
  },

  disconnect(sessionId: string): Promise<void> {
    return requestBackend<void>("mcp_disconnect", { sessionId }, { fallback: () => undefined });
  },

  listTools(sessionId: string): Promise<McpRemoteTool[]> {
    return requestBackend<McpRemoteTool[]>("mcp_list_entries", {
      sessionId,
      catalog: "tools",
    });
  },

  onConnectionsChanged(handler: () => void): Promise<() => void> {
    return subscribeBackendEvent("mcp-connections-changed", handler);
  },
};
