import { computed, reactive, ref } from "vue";
import { locale, t } from "@/locales";
import { showError } from "@/utils/errorToast";
import { streamChat, type PromptTurn, type ToolDefinition } from "./client";
import {
  collectEnabledMcpTools,
  invokeMcpTool,
  loadMcpConnections,
  resetMcpStateForTest,
  type ActiveMcpToolEntry,
} from "./mcp";
import {
  createDefaultConfig,
  isModelReady,
  makeEntityId,
  normalizeConfig,
  providerDisplayName,
  providerRequiresKey,
  resolveThinkingEffort,
  supportedThinkingEffortsOf,
} from "./presets";
import {
  deleteAiConversation,
  listAiConversations,
  readAiConfigRaw,
  readAiConversation,
  saveAiConfig,
  saveAiConversation,
} from "./storage";
import type {
  AiConfig,
  AiFolder,
  ChatAttachment,
  ChatMessage,
  ChatMessagePart,
  ChatToolCall,
  ConfiguredModel,
  Conversation,
  ConversationSummary,
  ModelOption,
  ThinkingEffort,
} from "./types";

const MAX_TOOL_ROUNDS = 8;

function makeTitleFromText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return t("ai.newChat");
  return clean.length > 28 ? `${clean.slice(0, 28)}…` : clean;
}

const config = ref<AiConfig>(createDefaultConfig());
const conversations = ref<ConversationSummary[]>([]);
const activeConversationId = ref<string>("");
const conversationCache = reactive<Record<string, Conversation>>({});
const streamingIds = reactive<Record<string, boolean>>({});
const activeControllers = new Map<string, AbortController>();

/** 尚未发送首条消息时的草稿会话设置 */
const draft = reactive({
  modelConfigId: "",
  promptPresetId: "",
  systemPrompt: "",
  temperature: null as number | null,
  pinned: false,
  folderId: "",
});

const initialized = ref(false);
const loading = ref(false);
let initPromise: Promise<void> | null = null;
let configWriteChain: Promise<void> = Promise.resolve();

export const availableModels = computed<ModelOption[]>(() =>
  config.value.models
    .filter(isModelReady)
    .map((m) => ({
      value: m.id,
      modelConfigId: m.id,
      providerId: m.providerId,
      providerName: providerDisplayName(m.providerId, locale.value),
      modelId: m.modelId,
      modelLabel: m.name || m.modelId,
      supportedEfforts: supportedThinkingEffortsOf(m),
      thinkingEffort: resolveThinkingEffort(m),
    })),
);

function findConfiguredModel(modelConfigId?: string, providerId?: string, modelId?: string): ConfiguredModel | undefined {
  const ready = config.value.models.filter(isModelReady);
  if (modelConfigId) {
    const exact = ready.find((m) => m.id === modelConfigId);
    if (exact) return exact;
  }
  if (providerId && modelId) {
    const matched = ready.find((m) => m.providerId === providerId && m.modelId === modelId);
    if (matched) return matched;
  }
  return undefined;
}

export function resolveFallbackModel(): ConfiguredModel | undefined {
  const ready = config.value.models.filter(isModelReady);
  if (!ready.length) return undefined;
  return ready.find((m) => m.id === config.value.settings.defaultModelConfigId) ?? ready[0];
}

export const activeConversation = computed<Conversation | null>(() => {
  const id = activeConversationId.value;
  return id ? (conversationCache[id] ?? null) : null;
});

export const currentModelConfigId = computed<string>(() => {
  const conv = activeConversation.value;
  if (conv) {
    const found = findConfiguredModel(conv.modelConfigId, conv.providerId, conv.modelId);
    if (found) return found.id;
  } else if (draft.modelConfigId) {
    const found = findConfiguredModel(draft.modelConfigId);
    if (found) return found.id;
  }
  return resolveFallbackModel()?.id ?? "";
});

export const currentPromptPresetId = computed<string>(() => {
  const conv = activeConversation.value;
  return conv ? (conv.promptPresetId ?? "") : draft.promptPresetId;
});

export const currentSystemPrompt = computed<string>(() => {
  const conv = activeConversation.value;
  return conv ? conv.systemPrompt : draft.systemPrompt;
});

export const currentTemperature = computed<number | null>(() => {
  const conv = activeConversation.value;
  return conv ? conv.temperature : draft.temperature;
});

export const isCurrentStreaming = computed<boolean>(() => {
  const id = activeConversationId.value;
  return Boolean(id && streamingIds[id]);
});

export function isConversationStreaming(id: string): boolean {
  return Boolean(streamingIds[id]);
}

function defaultSystemPromptText(): string {
  const presetId = config.value.settings.defaultPromptId;
  if (presetId) {
    const preset = config.value.prompts.find((p) => p.id === presetId);
    if (preset?.content.trim()) return preset.content.trim();
  }
  return config.value.settings.systemPrompt.trim();
}

export async function initAiStore(): Promise<void> {
  if (initialized.value) return;
  if (initPromise) return initPromise;
  loading.value = true;
  initPromise = (async () => {
    try {
      const [rawConfig, list] = await Promise.all([
        readAiConfigRaw(),
        listAiConversations(),
        loadMcpConnections(),
      ]);
      config.value = normalizeConfig(rawConfig);
      conversations.value = list;
      const fallback = resolveFallbackModel();
      draft.modelConfigId = fallback?.id ?? "";
      draft.promptPresetId = config.value.settings.defaultPromptId;
      draft.systemPrompt = "";
      draft.temperature = null;

      if (list.length > 0) {
        await selectConversation(list[0].id);
      }
      initialized.value = true;
    } catch (error) {
      showError(error);
    } finally {
      loading.value = false;
      initPromise = null;
    }
  })();
  return initPromise;
}

export function persistConfig(): Promise<void> {
  const snapshot: AiConfig = JSON.parse(JSON.stringify(config.value));
  configWriteChain = configWriteChain
    .then(() => saveAiConfig(snapshot))
    .catch((error) => {
      showError(error);
    });
  return configWriteChain;
}

export async function selectConversation(id: string): Promise<void> {
  activeConversationId.value = id;
  if (!id || conversationCache[id]) return;
  try {
    const loaded = await readAiConversation(id);
    if (loaded) {
      conversationCache[id] = reactive(loaded);
    } else {
      conversations.value = conversations.value.filter((item) => item.id !== id);
      if (activeConversationId.value === id) activeConversationId.value = "";
    }
  } catch (error) {
    showError(error);
  }
}

export function startNewConversation(target?: { pinned?: boolean; folderId?: string }): void {
  activeConversationId.value = "";
  const fallback = resolveFallbackModel();
  draft.modelConfigId = fallback?.id ?? "";
  draft.promptPresetId = config.value.settings.defaultPromptId;
  draft.systemPrompt = "";
  draft.temperature = null;
  const folder = target?.folderId
    ? config.value.folders.find((f) => f.id === target.folderId)
    : undefined;
  draft.folderId = folder?.id ?? "";
  draft.pinned = folder ? folder.pinned : Boolean(target?.pinned);
  if (folder?.collapsed) {
    folder.collapsed = false;
    void persistConfig();
  }
}

export async function createConversationInFolder(folderId: string): Promise<void> {
  const folder = config.value.folders.find((f) => f.id === folderId);
  if (!folder) return;
  const fallback = resolveFallbackModel();
  const now = Date.now();
  const id = makeEntityId("conv");
  const conv = reactive<Conversation>({
    id,
    title: t("ai.newChat"),
    modelConfigId: fallback?.id ?? "",
    providerId: fallback?.providerId ?? "",
    modelId: fallback?.modelId ?? "",
    promptPresetId: config.value.settings.defaultPromptId,
    systemPrompt: "",
    temperature: null,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    messages: [],
  });
  conversationCache[id] = conv;
  activeConversationId.value = id;
  moveConversation(id, { pinned: folder.pinned, folderId: folder.id });
  await persistConversation(conv);
}

export function createFolder(pinned: boolean, name?: string): AiFolder {
  const existing = config.value.folders.filter((f) => f.pinned === pinned).length;
  const folder: AiFolder = {
    id: makeEntityId("fld"),
    name: name?.trim() || t("ai.defaultFolderName", { n: existing + 1 }),
    pinned,
    collapsed: false,
    createdAt: Date.now(),
  };
  config.value.folders.push(folder);
  void persistConfig();
  return folder;
}

export function renameFolder(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const folder = config.value.folders.find((f) => f.id === id);
  if (!folder) return;
  folder.name = trimmed;
  void persistConfig();
}

export function toggleFolder(id: string): void {
  const folder = config.value.folders.find((f) => f.id === id);
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  void persistConfig();
}

export function deleteFolder(id: string): void {
  config.value.folders = config.value.folders.filter((f) => f.id !== id);
  for (const [convId, meta] of Object.entries(config.value.conversationMeta)) {
    if (meta.folderId === id) {
      delete meta.folderId;
      if (!meta.pinned) delete config.value.conversationMeta[convId];
    }
  }
  if (draft.folderId === id) draft.folderId = "";
  void persistConfig();
}

export function togglePinConversation(id: string): void {
  const current = config.value.conversationMeta[id];
  const nextPinned = !current?.pinned;
  // 切换固定/普通区域时移出原区域文件夹，避免跨区悬挂
  if (nextPinned) {
    config.value.conversationMeta[id] = { pinned: true };
  } else {
    delete config.value.conversationMeta[id];
  }
  void persistConfig();
}

export function moveConversation(
  id: string,
  target: { pinned: boolean; folderId?: string },
): void {
  const folder = target.folderId
    ? config.value.folders.find((f) => f.id === target.folderId)
    : undefined;
  const pinned = folder ? folder.pinned : target.pinned;
  const folderId = folder?.id;
  if (!pinned && !folderId) {
    delete config.value.conversationMeta[id];
  } else {
    config.value.conversationMeta[id] = {
      ...(pinned ? { pinned: true } : {}),
      ...(folderId ? { folderId } : {}),
    };
  }
  if (folder?.collapsed) {
    folder.collapsed = false;
  }
  void persistConfig();
}

export async function setCurrentModel(modelConfigId: string, effort?: ThinkingEffort): Promise<void> {
  const model = findConfiguredModel(modelConfigId);
  if (!model) return;
  if (effort !== undefined) {
    model.thinkingEffort = effort;
    void persistConfig();
  }
  const conv = activeConversation.value;
  if (!conv) {
    draft.modelConfigId = model.id;
    return;
  }
  conv.modelConfigId = model.id;
  conv.providerId = model.providerId;
  conv.modelId = model.modelId;
  conv.updatedAt = Date.now();
  await persistConversation(conv);
}

export async function setCurrentConversationOverrides(patch: {
  promptPresetId?: string;
  systemPrompt?: string;
  temperature?: number | null;
}): Promise<void> {
  const conv = activeConversation.value;
  if (!conv) {
    if (patch.promptPresetId !== undefined) draft.promptPresetId = patch.promptPresetId;
    if (patch.systemPrompt !== undefined) draft.systemPrompt = patch.systemPrompt;
    if (patch.temperature !== undefined) draft.temperature = patch.temperature;
    return;
  }
  if (patch.promptPresetId !== undefined) conv.promptPresetId = patch.promptPresetId;
  if (patch.systemPrompt !== undefined) conv.systemPrompt = patch.systemPrompt;
  if (patch.temperature !== undefined) conv.temperature = patch.temperature;
  conv.updatedAt = Date.now();
  await persistConversation(conv);
}

async function persistConversation(conv: Conversation): Promise<void> {
  try {
    const plain: Conversation = JSON.parse(JSON.stringify(conv));
    conversations.value = await saveAiConversation(plain);
  } catch (error) {
    showError(error);
  }
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  let conv: Conversation | null = conversationCache[id] ?? null;
  if (!conv) {
    try {
      const loaded = await readAiConversation(id);
      if (loaded) {
        conv = reactive(loaded);
        conversationCache[id] = conv;
      }
    } catch (error) {
      showError(error);
      return;
    }
  }
  if (!conv) return;
  conv.title = trimmed;
  conv.updatedAt = Date.now();
  await persistConversation(conv);
}

export async function removeConversation(id: string): Promise<void> {
  stopStreaming(id);
  delete conversationCache[id];
  if (config.value.conversationMeta[id]) {
    delete config.value.conversationMeta[id];
    void persistConfig();
  }
  try {
    conversations.value = await deleteAiConversation(id);
  } catch (error) {
    showError(error);
  }
  if (activeConversationId.value === id) {
    const next = conversations.value[0];
    if (next) await selectConversation(next.id);
    else startNewConversation();
  }
}

export function stopStreaming(conversationId = activeConversationId.value): void {
  if (!conversationId) return;
  const controller = activeControllers.get(conversationId);
  if (controller) {
    controller.abort();
    activeControllers.delete(conversationId);
  }
}

function buildContextTurns(messages: ChatMessage[], excludeId: string): PromptTurn[] {
  const valid = messages.filter(
    (m) => m.id !== excludeId && !m.error && (m.content.trim().length > 0 || Boolean(m.attachments?.length)),
  );
  const limit = config.value.settings.contextMessages;
  const sliced = limit > 0 && valid.length > limit ? valid.slice(valid.length - limit) : valid;
  return sliced.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.content, attachments: m.attachments }
      : { role: "assistant", content: m.content },
  );
}

function resolveConversationSystemPrompt(conv: Conversation): string {
  if (conv.systemPrompt.trim()) return conv.systemPrompt.trim();
  if (conv.promptPresetId) {
    const preset = config.value.prompts.find((p) => p.id === conv.promptPresetId);
    if (preset?.content.trim()) return preset.content.trim();
  }
  return defaultSystemPromptText();
}

function parseJsonObjectSafe(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 忽略解析异常，传入空对象
  }
  return {};
}

async function runAssistantTurn(conv: Conversation, fetchImpl?: typeof fetch): Promise<void> {
  const model =
    findConfiguredModel(conv.modelConfigId, conv.providerId, conv.modelId) ??
    findConfiguredModel(currentModelConfigId.value) ??
    resolveFallbackModel();
  if (!model) {
    throw new Error(t("ai.errors.noModelConfigured"));
  }

  conv.modelConfigId = model.id;
  conv.providerId = model.providerId;
  conv.modelId = model.modelId;

  const assistantMsg = reactive<ChatMessage>({
    id: makeEntityId("msg"),
    role: "assistant",
    content: "",
    reasoning: "",
    toolCalls: [],
    parts: [],
    createdAt: Date.now(),
    modelConfigId: model.id,
    modelId: model.modelId,
    modelName: model.name || model.modelId,
  });
  conv.messages.push(assistantMsg);
  conv.updatedAt = Date.now();
  await persistConversation(conv);

  const appendPart = (type: "reasoning" | "text", deltaText: string) => {
    const parts = assistantMsg.parts!;
    const last = parts[parts.length - 1];
    if (last && last.type === type) {
      last.text += deltaText;
    } else {
      parts.push(reactive({ id: makeEntityId("prt"), type, text: deltaText }) as ChatMessagePart);
    }
  };

  const controller = new AbortController();
  activeControllers.set(conv.id, controller);
  streamingIds[conv.id] = true;
  const started = performance.now();

  try {
    const turns = buildContextTurns(conv.messages, assistantMsg.id);
    const systemPrompt = resolveConversationSystemPrompt(conv);
    const temperature = conv.temperature ?? config.value.settings.temperature;

    // 汇总已启用的 MCP 工具
    const mcpEntries: ActiveMcpToolEntry[] = await collectEnabledMcpTools(config.value.enabledMcpIds);
    const mcpByFn = new Map(mcpEntries.map((entry) => [entry.functionName, entry]));
    const toolDefs: ToolDefinition[] = mcpEntries.map((entry) => ({
      name: entry.functionName,
      description: entry.tool.description || entry.tool.title || entry.tool.name,
      parameters: entry.tool.inputSchema ?? { type: "object", properties: {} },
    }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let roundContent = "";
      const result = await streamChat({
        endpoint: {
          protocol: model.protocol,
          baseUrl: model.baseUrl,
          apiKey: model.apiKey,
          requiresKey: providerRequiresKey(model.providerId),
        },
        modelId: model.modelId,
        messages: turns,
        systemPrompt: systemPrompt || undefined,
        temperature,
        maxTokens: config.value.settings.maxTokens,
        thinkingEffort: resolveThinkingEffort(model),
        stream: config.value.settings.stream,
        tools: toolDefs.length ? toolDefs : undefined,
        signal: controller.signal,
        fetchImpl,
        onDelta(delta) {
          if (delta.reasoning) {
            assistantMsg.reasoning = (assistantMsg.reasoning ?? "") + delta.reasoning;
            appendPart("reasoning", delta.reasoning);
          }
          if (delta.content) {
            roundContent += delta.content;
            assistantMsg.content += delta.content;
            appendPart("text", delta.content);
          }
        },
      });

      if (!result.toolCalls.length || controller.signal.aborted) break;

      turns.push({
        role: "assistant",
        content: roundContent,
        toolCalls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        if (controller.signal.aborted) break;
        const entry = mcpByFn.get(call.name);
        const uiCall = reactive<ChatToolCall>({
          id: call.id,
          serverId: entry?.serverId ?? "",
          serverName: entry?.serverName ?? "MCP",
          toolName: entry?.tool.name ?? call.name,
          argumentsText: call.argumentsText || "{}",
          status: "running",
        });
        assistantMsg.toolCalls!.push(uiCall);
        assistantMsg.parts!.push({ id: makeEntityId("prt"), type: "tool", call: uiCall });

        let toolResultText = "";
        if (!entry) {
          uiCall.status = "error";
          toolResultText = `Unknown MCP tool: ${call.name}`;
          uiCall.resultText = toolResultText;
        } else {
          try {
            const res = await invokeMcpTool(
              entry.serverId,
              entry.tool.name,
              parseJsonObjectSafe(call.argumentsText),
            );
            toolResultText = res.text;
            uiCall.status = res.isError ? "error" : "done";
            uiCall.resultText = toolResultText;
          } catch (error) {
            uiCall.status = "error";
            toolResultText = error instanceof Error ? error.message : String(error);
            uiCall.resultText = toolResultText;
          }
        }

        turns.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content: toolResultText,
        });
      }

      if (assistantMsg.content && !assistantMsg.content.endsWith("\n")) {
        assistantMsg.content += "\n\n";
      }
    }

    assistantMsg.durationMs = Math.round(performance.now() - started);
  } catch (error) {
    assistantMsg.durationMs = Math.round(performance.now() - started);
    if (controller.signal.aborted) {
      assistantMsg.aborted = true;
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      assistantMsg.error = msg;
      showError(msg);
    }
  } finally {
    activeControllers.delete(conv.id);
    streamingIds[conv.id] = false;
    conv.updatedAt = Date.now();
    await persistConversation(conv);
  }
}

export async function sendMessage(
  text: string,
  attachments: ChatAttachment[] = [],
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const trimmed = text.trim();
  const files = attachments.filter((item) => Boolean(item.dataUrl || item.textContent !== undefined));
  if (!trimmed && !files.length) return false;

  const model = findConfiguredModel(currentModelConfigId.value) ?? resolveFallbackModel();
  if (!model) {
    showError(t("ai.errors.noModelConfigured"));
    return false;
  }

  let conv = activeConversation.value;
  if (conv && streamingIds[conv.id]) return false;

  const now = Date.now();
  const initialTitle = trimmed ? makeTitleFromText(trimmed) : makeTitleFromText(files[0].name);
  if (!conv) {
    const id = makeEntityId("conv");
    conv = reactive<Conversation>({
      id,
      title: initialTitle,
      modelConfigId: model.id,
      providerId: model.providerId,
      modelId: model.modelId,
      promptPresetId: draft.promptPresetId,
      systemPrompt: draft.systemPrompt,
      temperature: draft.temperature,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      messages: [],
    });
    conversationCache[id] = conv;
    activeConversationId.value = id;
    if (draft.pinned || draft.folderId) {
      moveConversation(id, { pinned: draft.pinned, folderId: draft.folderId || undefined });
    }
  } else if (conv.messages.length === 0 && conv.title === t("ai.newChat")) {
    conv.title = initialTitle;
  }

  conv.messages.push(
    reactive<ChatMessage>({
      id: makeEntityId("msg"),
      role: "user",
      content: trimmed,
      ...(files.length ? { attachments: files } : {}),
      createdAt: now,
    }),
  );
  conv.updatedAt = now;

  try {
    await runAssistantTurn(conv, fetchImpl);
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

export async function regenerateMessage(messageId: string, fetchImpl?: typeof fetch): Promise<void> {
  const conv = activeConversation.value;
  if (!conv || streamingIds[conv.id]) return;
  const idx = conv.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  const target = conv.messages[idx];
  if (target.role === "assistant") {
    conv.messages.splice(idx);
  } else {
    conv.messages.splice(idx + 1);
  }
  if (!conv.messages.some((m) => m.role === "user")) return;
  try {
    await runAssistantTurn(conv, fetchImpl);
  } catch (error) {
    showError(error);
  }
}

export async function editAndResendMessage(
  messageId: string,
  newContent: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const trimmed = newContent.trim();
  const conv = activeConversation.value;
  if (!trimmed || !conv || streamingIds[conv.id]) return;
  const idx = conv.messages.findIndex((m) => m.id === messageId);
  if (idx < 0 || conv.messages[idx].role !== "user") return;
  conv.messages[idx].content = trimmed;
  conv.messages.splice(idx + 1);
  try {
    await runAssistantTurn(conv, fetchImpl);
  } catch (error) {
    showError(error);
  }
}

export async function deleteMessage(messageId: string): Promise<void> {
  const conv = activeConversation.value;
  if (!conv || streamingIds[conv.id]) return;
  const idx = conv.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  conv.messages.splice(idx, 1);
  conv.updatedAt = Date.now();
  await persistConversation(conv);
}

export async function clearConversationMessages(): Promise<void> {
  const conv = activeConversation.value;
  if (!conv || streamingIds[conv.id]) return;
  conv.messages = [];
  conv.updatedAt = Date.now();
  await persistConversation(conv);
}

export function resetAiStoreForTest(): void {
  for (const controller of activeControllers.values()) controller.abort();
  activeControllers.clear();
  for (const key of Object.keys(streamingIds)) delete streamingIds[key];
  for (const key of Object.keys(conversationCache)) delete conversationCache[key];
  resetMcpStateForTest();
  config.value = createDefaultConfig();
  conversations.value = [];
  activeConversationId.value = "";
  draft.modelConfigId = "";
  draft.promptPresetId = "";
  draft.systemPrompt = "";
  draft.temperature = null;
  draft.pinned = false;
  draft.folderId = "";
  initialized.value = false;
  loading.value = false;
  initPromise = null;
}

export function useAiStore() {
  return {
    config,
    conversations,
    activeConversationId,
    activeConversation,
    availableModels,
    currentModelConfigId,
    currentPromptPresetId,
    currentSystemPrompt,
    currentTemperature,
    isCurrentStreaming,
    initialized,
    loading,
    initAiStore,
    persistConfig,
    selectConversation,
    startNewConversation,
    createConversationInFolder,
    createFolder,
    renameFolder,
    toggleFolder,
    deleteFolder,
    togglePinConversation,
    moveConversation,
    setCurrentModel,
    setCurrentConversationOverrides,
    renameConversation,
    removeConversation,
    stopStreaming,
    sendMessage,
    regenerateMessage,
    editAndResendMessage,
    deleteMessage,
    clearConversationMessages,
    isConversationStreaming,
  };
}
