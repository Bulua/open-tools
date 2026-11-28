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
  outputSchema?: Record<string, unknown>;
}

export type McpTool = McpRemoteTool;

export interface McpPromptArgument {
  name: string;
  title?: string;
  description?: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceTemplate extends Omit<McpResource, "uri"> {
  uriTemplate: string;
}

export type McpCatalogKind = "tools" | "prompts" | "resources" | "resourceTemplates";

export interface McpToolCallResult {
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpRuntimeState {
  status: "idle" | "connecting" | "connected" | "error";
  tools: McpRemoteTool[];
  error?: string;
}
