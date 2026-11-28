/**
 * MCP 后端 API 定义（独立模块，供 AI 助手与 MCP 工具查看器共同复用，统一经由 `requestBackend` 与 `unwrapApiResponse` 处理 `{ code, msg, data }`）。
 */
import { requestBackend, subscribeBackendEvent, unwrapApiResponse } from "@/api/common";
import type { ApiResponsePayload } from "@/types/common";
import type {
  McpCatalogKind,
  McpConnectionItem,
  McpPrompt,
  McpRemoteTool,
  McpResource,
  McpResourceTemplate,
  McpServerConfig,
  McpServerInfo,
  McpToolCallResult,
} from "@/types/mcp";

export const mcpApi = {
  async readConnections(): Promise<McpConnectionItem[]> {
    const res = await requestBackend<ApiResponsePayload<McpConnectionItem[]>>(
      "mcp_read_connections",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: [] }) },
    );
    return unwrapApiResponse(res);
  },

  async saveConnections(connections: McpConnectionItem[]): Promise<McpConnectionItem[]> {
    const res = await requestBackend<ApiResponsePayload<McpConnectionItem[]>>(
      "mcp_save_connections",
      { connections },
    );
    return unwrapApiResponse(res);
  },

  async activeSessions(): Promise<string[]> {
    const res = await requestBackend<ApiResponsePayload<string[]>>(
      "mcp_active_sessions",
      undefined,
      { fallback: () => ({ code: "ok", msg: "", data: [] }) },
    );
    return unwrapApiResponse(res);
  },

  async connect(sessionId: string, config: McpServerConfig): Promise<McpServerInfo> {
    const res = await requestBackend<ApiResponsePayload<McpServerInfo>>(
      "mcp_connect",
      { sessionId, config },
    );
    return unwrapApiResponse(res);
  },

  async disconnect(sessionId: string): Promise<void> {
    const res = await requestBackend<ApiResponsePayload<null>>(
      "mcp_disconnect",
      { sessionId },
      { fallback: () => ({ code: "ok", msg: "", data: null }) },
    );
    unwrapApiResponse(res);
  },

  async listEntries<T>(sessionId: string, catalog: McpCatalogKind): Promise<T[]> {
    const res = await requestBackend<ApiResponsePayload<T[]>>(
      "mcp_list_entries",
      { sessionId, catalog },
    );
    return unwrapApiResponse(res);
  },

  listTools(sessionId: string): Promise<McpRemoteTool[]> {
    return this.listEntries<McpRemoteTool>(sessionId, "tools");
  },

  listPrompts(sessionId: string): Promise<McpPrompt[]> {
    return this.listEntries<McpPrompt>(sessionId, "prompts");
  },

  listResources(sessionId: string): Promise<McpResource[]> {
    return this.listEntries<McpResource>(sessionId, "resources");
  },

  listResourceTemplates(sessionId: string): Promise<McpResourceTemplate[]> {
    return this.listEntries<McpResourceTemplate>(sessionId, "resourceTemplates");
  },

  async callTool(
    sessionId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    const res = await requestBackend<ApiResponsePayload<McpToolCallResult>>(
      "mcp_call_tool",
      { sessionId, name, arguments: args },
    );
    return unwrapApiResponse(res);
  },

  async getPrompt(
    sessionId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await requestBackend<ApiResponsePayload<Record<string, unknown>>>(
      "mcp_get_prompt",
      { sessionId, name, arguments: args },
    );
    return unwrapApiResponse(res);
  },

  async readResource(sessionId: string, uri: string): Promise<Record<string, unknown>> {
    const res = await requestBackend<ApiResponsePayload<Record<string, unknown>>>(
      "mcp_read_resource",
      { sessionId, uri },
    );
    return unwrapApiResponse(res);
  },

  onConnectionsChanged(handler: () => void): Promise<() => void> {
    return subscribeBackendEvent("mcp-connections-changed", handler);
  },
};
