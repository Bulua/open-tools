import { reactive, ref } from "vue";
import { showError } from "@/utils/errorToast";
import type { McpConnectionItem, McpRemoteTool } from "./types";

const MCP_FALLBACK_KEY = "open-tools:ai:mcp-fallback";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export function aiMcpSessionId(connectionId: string): string {
  return `ai-chat:${connectionId}`;
}

export interface McpRuntimeState {
  status: "idle" | "connecting" | "connected" | "error";
  tools: McpRemoteTool[];
  error?: string;
}

export interface ActiveMcpToolEntry {
  /** 传给大模型的安全函数名（全局唯一，满足 ^[a-zA-Z0-9_-]{1,64}$） */
  functionName: string;
  serverId: string;
  serverName: string;
  tool: McpRemoteTool;
}

const connections = ref<McpConnectionItem[]>([]);
const loaded = ref(false);
const runtimeStates = reactive<Record<string, McpRuntimeState>>({});

function ensureRuntime(id: string): McpRuntimeState {
  if (!runtimeStates[id]) {
    runtimeStates[id] = { status: "idle", tools: [] };
  }
  return runtimeStates[id];
}

/** 读取「MCP 工具查看器」持久化的全部 MCP 连接 */
export async function loadMcpConnections(): Promise<McpConnectionItem[]> {
  try {
    if (hasTauriRuntime()) {
      connections.value = await tauriInvoke<McpConnectionItem[]>("mcp_read_connections");
      const activeIds = await tauriInvoke<string[]>("mcp_active_sessions").catch(() => [] as string[]);
      const activeSet = new Set(activeIds);
      for (const conn of connections.value) {
        const state = ensureRuntime(conn.id);
        if (activeSet.has(aiMcpSessionId(conn.id)) && state.status !== "connected") {
          state.status = "connected";
          void refreshMcpTools(conn.id);
        } else if (!activeSet.has(aiMcpSessionId(conn.id)) && state.status === "connected") {
          state.status = "idle";
          state.tools = [];
        }
      }
    } else {
      const raw = localStorage.getItem(MCP_FALLBACK_KEY);
      connections.value = raw ? (JSON.parse(raw) as McpConnectionItem[]) : [];
    }
    loaded.value = true;
  } catch (error) {
    showError(error);
  }
  return connections.value;
}

/** 写回共享的 MCP 持久化文件（与 MCP 工具查看器双向同步） */
export async function saveMcpConnections(list: McpConnectionItem[]): Promise<void> {
  const plain: McpConnectionItem[] = JSON.parse(JSON.stringify(list));
  if (hasTauriRuntime()) {
    await tauriInvoke<void>("mcp_save_connections", { connections: plain });
  } else {
    localStorage.setItem(MCP_FALLBACK_KEY, JSON.stringify(plain));
  }
  connections.value = plain;
}

export async function connectMcpServer(conn: McpConnectionItem): Promise<McpRemoteTool[]> {
  const state = ensureRuntime(conn.id);
  if (!hasTauriRuntime()) {
    state.status = "error";
    state.error = "Desktop runtime required";
    throw new Error("Desktop runtime required");
  }
  const sessionId = aiMcpSessionId(conn.id);
  state.status = "connecting";
  state.error = undefined;
  try {
    const active = await tauriInvoke<string[]>("mcp_active_sessions").catch(() => [] as string[]);
    if (!active.includes(sessionId)) {
      await tauriInvoke("mcp_connect", { sessionId, config: conn.config });
    }
    const tools = await tauriInvoke<McpRemoteTool[]>("mcp_list_entries", {
      sessionId,
      catalog: "tools",
    });
    state.tools = Array.isArray(tools) ? tools : [];
    state.status = "connected";
    return state.tools;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    state.status = "error";
    state.error = msg;
    throw error;
  }
}

export async function refreshMcpTools(connectionId: string): Promise<McpRemoteTool[]> {
  const conn = connections.value.find((c) => c.id === connectionId);
  if (!conn) return [];
  return connectMcpServer(conn);
}

export async function disconnectMcpServer(connectionId: string): Promise<void> {
  const state = ensureRuntime(connectionId);
  if (hasTauriRuntime()) {
    await tauriInvoke("mcp_disconnect", { sessionId: aiMcpSessionId(connectionId) }).catch(() => {});
  }
  state.status = "idle";
  state.tools = [];
  state.error = undefined;
}

/** 生成大模型兼容的唯一工具函数名 */
export function buildSafeFunctionName(serverIndex: number, toolName: string, used: Set<string>): string {
  const clean = toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
  let candidate = `mcp_${serverIndex}_${clean}`.slice(0, 60);
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let suffix = 2;
  while (used.has(`${candidate}_${suffix}`)) suffix++;
  candidate = `${candidate}_${suffix}`.slice(0, 64);
  used.add(candidate);
  return candidate;
}

/** 连接所有已启用的 MCP 服务并汇总可用工具列表 */
export async function collectEnabledMcpTools(enabledIds: string[]): Promise<ActiveMcpToolEntry[]> {
  if (!enabledIds.length || !hasTauriRuntime()) return [];
  if (!loaded.value) await loadMcpConnections();
  const targets = connections.value.filter((c) => enabledIds.includes(c.id));
  if (!targets.length) return [];

  const entries: ActiveMcpToolEntry[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < targets.length; i++) {
    const conn = targets[i];
    const state = ensureRuntime(conn.id);
    let tools = state.status === "connected" ? state.tools : [];
    if (state.status !== "connected") {
      try {
        tools = await connectMcpServer(conn);
      } catch (error) {
        showError(error);
        continue;
      }
    }
    for (const tool of tools) {
      entries.push({
        functionName: buildSafeFunctionName(i + 1, tool.name, usedNames),
        serverId: conn.id,
        serverName: conn.name,
        tool,
      });
    }
  }
  return entries;
}

/** 将 MCP CallToolResult 转为易读字符串喂回给大模型 */
export function formatMcpToolResult(result: unknown): string {
  if (result === null || result === undefined) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const rec = result as Record<string, unknown>;
    if (Array.isArray(rec.content)) {
      const parts = rec.content.map((item) => {
        if (!item || typeof item !== "object") return String(item);
        const block = item as Record<string, unknown>;
        if (typeof block.text === "string") return block.text;
        return JSON.stringify(block, null, 2);
      });
      const text = parts.join("\n").trim();
      if (text) return rec.isError ? `Error: ${text}` : text;
    }
  }
  return JSON.stringify(result, null, 2);
}

export async function invokeMcpTool(
  serverId: string,
  toolName: string,
  argumentsObj: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const result = await tauriInvoke<unknown>("mcp_call_tool", {
    sessionId: aiMcpSessionId(serverId),
    name: toolName,
    arguments: argumentsObj,
  });
  const isError = Boolean(
    result && typeof result === "object" && (result as Record<string, unknown>).isError === true,
  );
  return { text: formatMcpToolResult(result), isError };
}

export function resetMcpStateForTest(): void {
  connections.value = [];
  loaded.value = false;
  for (const key of Object.keys(runtimeStates)) delete runtimeStates[key];
}

export function useAiMcp() {
  return {
    connections,
    loaded,
    runtimeStates,
    loadMcpConnections,
    saveMcpConnections,
    connectMcpServer,
    refreshMcpTools,
    disconnectMcpServer,
  };
}
