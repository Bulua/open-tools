type StringMap = Record<string, string>;

export type McpConfig =
  | { type: "stdio"; command: string; args?: string[]; env?: StringMap; env_vars?: string[]; cwd?: string }
  | {
      type: "http";
      url: string;
      headers?: StringMap;
      env_http_headers?: StringMap;
      bearer_token_env_var?: string;
    };

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface McpServerInfo {
  serverInfo?: { name: string; version: string } | null;
  protocolVersion: string;
}

export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: { name: string; title?: string; description?: string; required?: boolean }[];
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

type ParseError = "invalidServer" | "unsupportedType" | "invalidUrl";
type ParsedServer = { config: McpConfig } | { error: ParseError };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseToolArguments(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function connectionTarget(config: McpConfig): string {
  if (config.type === "stdio") return config.command;
  const { host, pathname } = new URL(config.url);
  return host + pathname;
}

function isStringMap(value: unknown): value is StringMap {
  return isObject(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isEnvName(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && !/[=\x00]/.test(value);
}

export function parseMcpServer(raw: unknown): ParsedServer {
  if (!isObject(raw)) return { error: "invalidServer" };
  const type = raw.type;
  if (type === "stdio") {
    const { command, args, env, env_vars, cwd } = raw;
    if (
      "url" in raw ||
      typeof command !== "string" || !command.trim() ||
      (args !== undefined && !isStringList(args)) ||
      (env !== undefined && !isStringMap(env)) ||
      (env_vars !== undefined && (!isStringList(env_vars) || !env_vars.every(isEnvName))) ||
      (cwd !== undefined && (typeof cwd !== "string" || !cwd.trim()))
    ) return { error: "invalidServer" };
    return { config: { type: "stdio", command: command.trim(), args, env, env_vars, cwd } };
  }
  if (type !== "http") return { error: "unsupportedType" };
  const { url, headers, env_http_headers, bearer_token_env_var } = raw;
  if (
    "command" in raw || typeof url !== "string" ||
    (headers !== undefined && !isStringMap(headers)) ||
    (env_http_headers !== undefined && (!isStringMap(env_http_headers) || !Object.values(env_http_headers).every(isEnvName))) ||
    (bearer_token_env_var !== undefined && !isEnvName(bearer_token_env_var))
  ) {
    return { error: "invalidServer" };
  }
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { config: {
        type: "http",
        url: parsed.href,
        headers,
        env_http_headers,
        bearer_token_env_var,
      } };
    }
  } catch {
    return { error: "invalidUrl" };
  }
  return { error: "invalidUrl" };
}
