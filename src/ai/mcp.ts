import { reactive, ref } from "vue";
import { mcpApi } from "@/api/mcp";
import { hasDesktopRuntime } from "@/api/common";
import type { McpConnectionItem, McpRemoteTool, McpRuntimeState } from "@/types/mcp";
import { showError } from "@/utils/errorToast";

export type { McpRuntimeState };

export function aiMcpSessionId(connectionId: string): string {
  return `ai-chat:${connectionId}`;
}

const connections = ref<McpConnectionItem[]>([]);
const loaded = ref(false);
const runtimeStates = reactive<Record<string, McpRuntimeState>>({});
let mcpEventSubscribed = false;

function ensureMcpChangeListener(): void {
  if (mcpEventSubscribed || !hasDesktopRuntime()) return;
  mcpEventSubscribed = true;
  void mcpApi.onConnectionsChanged(() => void loadMcpConnections()).catch(() => {
    mcpEventSubscribed = false;
  });
}

function ensureRuntime(id: string): McpRuntimeState {
  if (!runtimeStates[id]) {
    runtimeStates[id] = { status: "idle", tools: [] };
  }
  return runtimeStates[id];
}

/** 读取「MCP 工具查看器」持久化的全部 MCP 连接 */
export async function loadMcpConnections(): Promise<McpConnectionItem[]> {
  ensureMcpChangeListener();
  try {
    connections.value = await mcpApi.readConnections();
    const activeIds = await mcpApi.activeSessions().catch(() => [] as string[]);
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
    loaded.value = true;
  } catch (error) {
    showError(error);
  }
  return connections.value;
}

/** 写回共享的 MCP 持久化存储（新建未分配 ID 的连接将由后端自动生成雪花 ID 并返回） */
export async function saveMcpConnections(list: McpConnectionItem[]): Promise<McpConnectionItem[]> {
  const plain: McpConnectionItem[] = JSON.parse(JSON.stringify(list));
  const saved = await mcpApi.saveConnections(plain);
  connections.value = saved;
  return saved;
}

export async function connectMcpServer(conn: McpConnectionItem): Promise<McpRemoteTool[]> {
  const state = ensureRuntime(conn.id);
  const sessionId = aiMcpSessionId(conn.id);
  state.status = "connecting";
  state.error = undefined;
  try {
    const active = await mcpApi.activeSessions().catch(() => [] as string[]);
    if (!active.includes(sessionId)) {
      await mcpApi.connect(sessionId, conn.config);
    }
    const tools = await mcpApi.listTools(sessionId);
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
  await mcpApi.disconnect(aiMcpSessionId(connectionId)).catch(() => {});
  state.status = "idle";
  state.tools = [];
  state.error = undefined;
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
