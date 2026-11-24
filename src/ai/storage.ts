import type { AiConfig, Conversation, ConversationSummary } from "./types";

const CONFIG_FALLBACK_KEY = "open-tools:ai:config";
const CONVERSATIONS_FALLBACK_KEY = "open-tools:ai:conversations";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function readFallbackMap(): Record<string, Conversation> {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Conversation>) : {};
  } catch {
    return {};
  }
}

function writeFallbackMap(map: Record<string, Conversation>): void {
  try {
    localStorage.setItem(CONVERSATIONS_FALLBACK_KEY, JSON.stringify(map));
  } catch {
    // 浏览器兜底模式下容量不足时静默跳过
  }
}

function toSummary(conv: Conversation): ConversationSummary {
  return {
    id: conv.id,
    title: conv.title,
    providerId: conv.providerId,
    modelId: conv.modelId,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
  };
}

export async function readAiConfigRaw(): Promise<unknown | null> {
  if (hasTauriRuntime()) {
    const text = await tauriInvoke<string | null>("ai_read_config");
    return text ? JSON.parse(text) : null;
  }
  try {
    const text = localStorage.getItem(CONFIG_FALLBACK_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  const data = JSON.stringify(config);
  if (hasTauriRuntime()) {
    await tauriInvoke<void>("ai_save_config", { data });
    return;
  }
  localStorage.setItem(CONFIG_FALLBACK_KEY, data);
}

export async function listAiConversations(): Promise<ConversationSummary[]> {
  if (hasTauriRuntime()) {
    return tauriInvoke<ConversationSummary[]>("ai_list_conversations");
  }
  return Object.values(readFallbackMap())
    .map(toSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readAiConversation(id: string): Promise<Conversation | null> {
  if (hasTauriRuntime()) {
    const text = await tauriInvoke<string | null>("ai_read_conversation", { id });
    return text ? (JSON.parse(text) as Conversation) : null;
  }
  return readFallbackMap()[id] ?? null;
}

export async function saveAiConversation(conversation: Conversation): Promise<ConversationSummary[]> {
  const summary = toSummary(conversation);
  const data = JSON.stringify(conversation);
  if (hasTauriRuntime()) {
    return tauriInvoke<ConversationSummary[]>("ai_save_conversation", { summary, data });
  }
  const map = readFallbackMap();
  map[conversation.id] = conversation;
  writeFallbackMap(map);
  return Object.values(map)
    .map(toSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteAiConversation(id: string): Promise<ConversationSummary[]> {
  if (hasTauriRuntime()) {
    return tauriInvoke<ConversationSummary[]>("ai_delete_conversation", { id });
  }
  const map = readFallbackMap();
  delete map[id];
  writeFallbackMap(map);
  return Object.values(map)
    .map(toSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
