/**
 * MCP 模块公共类型定义（供 AI 助手与 MCP 工具查看器共同复用）。
 */

export type McpServerConfig =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      env_vars?: string[];
      cwd?: string;
    }
  | {
      type: "http";
      url: string;
      headers?: Record<string, string>;
      env_http_headers?: Record<string, string>;
      bearer_token_env_var?: string;
    };

export interface McpConnectionItem {
  id: string;
  name: string;
  config: McpServerConfig;
}

export interface McpServerInfo {
  serverInfo?: { name: string; version: string } | null;
  protocolVersion: string;
}

export interface McpRemoteTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpRuntimeState {
  status: "idle" | "connecting" | "connected" | "error";
  tools: McpRemoteTool[];
  error?: string;
}
