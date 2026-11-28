import { computed, reactive, ref } from "vue";
import { aiApi } from "@/api/ai";
import { locale, t } from "@/locales";
import type {
  AiBuiltinToolInfo,
  AiConfig,
  AiConversationMeta,
  AiConversationMetaUpdate,
  AiFolder,
  AiModelUpsertInput,
  BackendChatEvent,
  ChatAttachment,
  ChatMessage,
  ChatMessagePart,
  ChatToolCall,
  ConfiguredModel,
  Conversation,
  ConversationSummary,
  ExecutionPolicy,
  ModelOption,
  PendingToolApproval,
  PromptTurn,
  ThinkingEffort,
  ToolApprovalDecision,
} from "@/types/ai";
import { formatNowDateTime } from "@/utils/datetime";
import { showError } from "@/utils/errorToast";
import { persistAttachmentsToWorkspace } from "./attachments";
import { invalidateLocalImageCache, resolveConversationWorkspaceDir } from "./builtinTools";
import { loadMcpConnections } from "./mcp";
import {
  createDefaultConfig,
  isModelReady,
  resolveModelProviderName,
  resolveThinkingEffort,
  supportedThinkingEffortsOf,
} from "./presets";

function nextPartKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTitleFromText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return t("ai.newChat");
  return clean.length > 28 ? `${clean.slice(0, 28)}…` : clean;
}

const config = ref<AiConfig>(createDefaultConfig());
const builtinTools = ref<AiBuiltinToolInfo[]>([]);
const conversations = ref<ConversationSummary[]>([]);
const activeConversationId = ref<string>("");
const conversationCache = reactive<Record<string, Conversation>>({});
const streamingIds = reactive<Record<string, boolean>>({});
const pendingApprovals = reactive<Record<string, PendingToolApproval>>({});

/** 尚未发送首条消息时的草稿会话设置 */
const draft = reactive({
  modelConfigId: "",
  workspaceDir: "",
  executionPolicy: "review" as ExecutionPolicy,
  pinned: false,
  folderId: "",
});

const initialized = ref(false);
const loading = ref(false);
let initPromise: Promise<void> | null = null;

export const enabledBuiltinToolsCount = computed<number>(() =>
  builtinTools.value.filter((tool) => !config.value.disabledBuiltinTools.includes(tool.name)).length,
);

export const availableModels = computed<ModelOption[]>(() =>
  config.value.models
    .filter(isModelReady)
    .map((m) => ({
      value: m.id,
      modelConfigId: m.id,
      providerId: m.providerId,
      providerName: resolveModelProviderName(m, locale.value),
      modelId: m.modelId,
      modelLabel: m.name || m.modelId,
      supportedEfforts: supportedThinkingEffortsOf(m),
      thinkingEffort: resolveThinkingEffort(m),
    })),
);

function findConfiguredModel(
  modelConfigId?: string,
  providerId?: string,
  modelId?: string,
): ConfiguredModel | undefined {
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
  return ready.find((m) => m.isDefault) ?? ready[0];
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

export const isCurrentStreaming = computed<boolean>(() => {
  const id = activeConversationId.value;
  return Boolean(id && streamingIds[id]);
});

export const currentWorkspaceDir = computed<string>(() => {
  const conv = activeConversation.value;
  return conv ? (conv.workspaceDir ?? "") : draft.workspaceDir;
});

export const currentExecutionPolicy = computed<ExecutionPolicy>(() => {
  const conv = activeConversation.value;
  return conv ? (conv.executionPolicy ?? "review") : draft.executionPolicy;
});

export const currentPendingApproval = computed<PendingToolApproval | null>(() => {
  const id = activeConversationId.value;
  return id ? (pendingApprovals[id] ?? null) : null;
});

export function isConversationStreaming(id: string): boolean {
  return Boolean(streamingIds[id]);
}

async function upsertConversationRow(conv: Conversation): Promise<string | null> {
  try {
    const res = await aiApi.upsertConversation(conv);
    if (!conv.id) conv.id = res.id;
    conversations.value = res.conversations;
    return res.id;
  } catch (error) {
    showError(error);
    return null;
  }
}

export async function upsertModel(input: AiModelUpsertInput): Promise<void> {
  try {
    config.value.models = await aiApi.upsertModel(input);
  } catch (error) {
    showError(error);
    throw error;
  }
}

export async function deleteModel(id: string): Promise<void> {
  try {
    config.value.models = await aiApi.deleteModel(id);
  } catch (error) {
    showError(error);
  }
}

export async function setDefaultModel(id: string | null): Promise<void> {
  try {
    config.value.models = await aiApi.setDefaultModel(id);
  } catch (error) {
    showError(error);
  }
}

export async function setModelEnabled(id: string, enabled: boolean): Promise<void> {
  try {
    config.value.models = await aiApi.setModelEnabled(id, enabled);
  } catch (error) {
    showError(error);
  }
}

export async function setEnabledMcpIds(ids: string[]): Promise<void> {
  const deduped = [...new Set(ids)];
  config.value.enabledMcpIds = deduped;
  try {
    await aiApi.setEnabledMcpIds(deduped);
  } catch (error) {
    showError(error);
  }
}

export async function setDisabledBuiltinTools(names: string[]): Promise<void> {
  const deduped = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  config.value.disabledBuiltinTools = deduped;
  try {
    await aiApi.setDisabledBuiltinTools(deduped);
  } catch (error) {
    showError(error);
  }
}

export async function setBuiltinToolEnabled(name: string, enabled: boolean): Promise<void> {
  const next = enabled
    ? config.value.disabledBuiltinTools.filter((item) => item !== name)
    : [...config.value.disabledBuiltinTools, name];
  await setDisabledBuiltinTools(next);
}

export async function setAllBuiltinToolsEnabled(enabled: boolean): Promise<void> {
  const next = enabled ? [] : builtinTools.value.map((tool) => tool.name);
  await setDisabledBuiltinTools(next);
}

export function resolveToolApproval(conversationId: string, decision: ToolApprovalDecision): void {
  const pending = pendingApprovals[conversationId];
  if (pending && decision === "session") {
    const conv = conversationCache[conversationId];
    if (conv && conv.executionPolicy !== "auto") {
      conv.executionPolicy = "auto";
      conv.updatedAt = formatNowDateTime();
      void upsertConversationRow(conv);
    }
  }
  delete pendingApprovals[conversationId];
  void aiApi.approveTool(conversationId, decision);
}

export async function setCurrentExecutionPolicy(policy: ExecutionPolicy): Promise<void> {
  const conv = activeConversation.value;
  if (!conv) {
    draft.executionPolicy = policy;
    return;
  }
  conv.executionPolicy = policy;
  if (policy === "auto" && pendingApprovals[conv.id]) {
    resolveToolApproval(conv.id, "once");
  }
  void aiApi.setExecutionPolicy(conv.id, policy);
  conv.updatedAt = formatNowDateTime();
  await upsertConversationRow(conv);
}

export async function setCurrentWorkspaceDir(dir: string): Promise<void> {
  const trimmed = dir.trim();
  const conv = activeConversation.value;
  if (!conv) {
    draft.workspaceDir = trimmed;
    return;
  }
  conv.workspaceDir = trimmed || undefined;
  conv.updatedAt = formatNowDateTime();
  await upsertConversationRow(conv);
}

export async function initAiStore(): Promise<void> {
  if (initialized.value) return;
  if (initPromise) return initPromise;
  loading.value = true;
  initPromise = (async () => {
    try {
      const [state] = await Promise.all([aiApi.loadState(), loadMcpConnections()]);
      config.value = {
        models: state.models,
        enabledMcpIds: state.enabledMcpIds,
        disabledBuiltinTools: state.disabledBuiltinTools,
        folders: state.folders,
        conversationMeta: state.conversationMeta,
      };
      builtinTools.value = state.builtinTools;
      conversations.value = state.conversations;
      const fallback = resolveFallbackModel();
      draft.modelConfigId = fallback?.id ?? "";

      if (state.conversations.length > 0) {
        await selectConversation(state.conversations[0].id);
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

export async function selectConversation(id: string): Promise<void> {
  activeConversationId.value = id;
  if (!id || conversationCache[id]) return;
  try {
    const loaded = await aiApi.readConversation(id);
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
  draft.workspaceDir = "";
  draft.executionPolicy = "review";
  const folder = target?.folderId
    ? config.value.folders.find((f) => f.id === target.folderId)
    : undefined;
  draft.folderId = folder?.id ?? "";
  draft.pinned = folder ? folder.pinned : Boolean(target?.pinned);
  if (folder?.collapsed) {
    folder.collapsed = false;
    void aiApi.upsertFolder(folder).catch(showError);
  }
}

export async function createConversationInFolder(folderId: string): Promise<void> {
  const folder = config.value.folders.find((f) => f.id === folderId);
  if (!folder) return;
  const fallback = resolveFallbackModel();
  const now = formatNowDateTime();
  const conv = reactive<Conversation>({
    id: "",
    title: t("ai.newChat"),
    modelConfigId: fallback?.id ?? "",
    providerId: fallback?.providerId ?? "",
    modelId: fallback?.modelId ?? "",
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    messages: [],
  });
  const id = await upsertConversationRow(conv);
  if (!id) return;
  conversationCache[id] = conv;
  activeConversationId.value = id;
  moveConversation(id, { pinned: folder.pinned, folderId: folder.id });
}

export async function createFolder(pinned: boolean, name?: string): Promise<AiFolder | null> {
  const existing = config.value.folders.filter((f) => f.pinned === pinned).length;
  const draftFolder: AiFolder = {
    id: "",
    name: name?.trim() || t("ai.defaultFolderName", { n: existing + 1 }),
    pinned,
    collapsed: false,
    createdAt: formatNowDateTime(),
  };
  try {
    const saved = await aiApi.upsertFolder(draftFolder);
    config.value.folders.push(saved);
    return saved;
  } catch (error) {
    showError(error);
    return null;
  }
}

export function renameFolder(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const folder = config.value.folders.find((f) => f.id === id);
  if (!folder) return;
  folder.name = trimmed;
  void aiApi.upsertFolder(folder).catch(showError);
}

export function toggleFolder(id: string): void {
  const folder = config.value.folders.find((f) => f.id === id);
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  void aiApi.upsertFolder(folder).catch(showError);
}

export function sortConversationsByMeta(
  list: readonly ConversationSummary[],
  metaMap: Readonly<Record<string, AiConversationMeta>>,
): ConversationSummary[] {
  return [...list].sort((a, b) => {
    const oa = metaMap[a.id]?.order;
    const ob = metaMap[b.id]?.order;
    if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob;
    if (oa !== undefined && ob === undefined) return -1;
    if (oa === undefined && ob !== undefined) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function deleteFolder(id: string): void {
  config.value.folders = config.value.folders.filter((f) => f.id !== id);
  for (const [convId, meta] of Object.entries(config.value.conversationMeta)) {
    if (meta.folderId === id) {
      delete meta.folderId;
      delete meta.order;
      if (!meta.pinned) delete config.value.conversationMeta[convId];
    }
  }
  if (draft.folderId === id) draft.folderId = "";
  void aiApi.deleteFolder(id).catch(showError);
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
  void aiApi
    .updateConversationMeta([{ conversationId: id, pinned: nextPinned, folderId: null, order: null }])
    .catch(showError);
}

export function moveConversation(
  id: string,
  target: { pinned: boolean; folderId?: string; beforeId?: string; afterId?: string },
): void {
  const folder = target.folderId
    ? config.value.folders.find((f) => f.id === target.folderId)
    : undefined;
  const pinned = folder ? folder.pinned : target.pinned;
  const folderId = folder?.id;

  // 先取出目标分组中除当前项之外的已有会话（保持现有展示顺序）
  const siblings = sortConversationsByMeta(
    conversations.value.filter((item) => {
      if (item.id === id) return false;
      const meta = config.value.conversationMeta[item.id];
      return Boolean(meta?.pinned) === pinned && (meta?.folderId ?? undefined) === folderId;
    }),
    config.value.conversationMeta,
  );

  const orderedIds = siblings.map((item) => item.id);
  const beforeIdx = target.beforeId ? orderedIds.indexOf(target.beforeId) : -1;
  const afterIdx = target.afterId ? orderedIds.indexOf(target.afterId) : -1;

  if (beforeIdx >= 0) {
    orderedIds.splice(beforeIdx, 0, id);
  } else if (afterIdx >= 0) {
    orderedIds.splice(afterIdx + 1, 0, id);
  } else {
    orderedIds.unshift(id);
  }

  // 是否需要写入显式排序（当存在目标定位或该分组内有多项时按新顺序固化）
  const shouldWriteOrder =
    Boolean(target.beforeId || target.afterId) ||
    orderedIds.some((cid) => config.value.conversationMeta[cid]?.order !== undefined);

  const metaUpdates: AiConversationMetaUpdate[] = [];
  if (shouldWriteOrder) {
    orderedIds.forEach((cid, idx) => {
      config.value.conversationMeta[cid] = {
        ...(pinned ? { pinned: true } : {}),
        ...(folderId ? { folderId } : {}),
        order: idx,
      };
      metaUpdates.push({
        conversationId: cid,
        pinned,
        folderId: folderId ?? null,
        order: idx,
      });
    });
  } else if (!pinned && !folderId) {
    delete config.value.conversationMeta[id];
    metaUpdates.push({
      conversationId: id,
      pinned: false,
      folderId: null,
      order: null,
    });
  } else {
    config.value.conversationMeta[id] = {
      ...(pinned ? { pinned: true } : {}),
      ...(folderId ? { folderId } : {}),
    };
    metaUpdates.push({
      conversationId: id,
      pinned,
      folderId: folderId ?? null,
      order: null,
    });
  }

  if (folder?.collapsed) {
    folder.collapsed = false;
    void aiApi.upsertFolder(folder).catch(showError);
  }
  void aiApi.updateConversationMeta(metaUpdates).catch(showError);
}

export async function setCurrentModel(modelConfigId: string, effort?: ThinkingEffort): Promise<void> {
  const model = findConfiguredModel(modelConfigId);
  if (!model) return;
  if (effort !== undefined) {
    model.thinkingEffort = effort;
    void aiApi.setModelThinkingEffort(model.id, effort).catch(showError);
  }
  const conv = activeConversation.value;
  if (!conv) {
    draft.modelConfigId = model.id;
    return;
  }
  conv.modelConfigId = model.id;
  conv.providerId = model.providerId;
  conv.modelId = model.modelId;
  conv.updatedAt = formatNowDateTime();
  await upsertConversationRow(conv);
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  let conv: Conversation | null = conversationCache[id] ?? null;
  if (!conv) {
    try {
      const loaded = await aiApi.readConversation(id);
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
  conv.updatedAt = formatNowDateTime();
  await upsertConversationRow(conv);
}

export async function removeConversation(id: string): Promise<void> {
  stopStreaming(id);
  delete conversationCache[id];
  void aiApi.clearChatSession(id);
  delete config.value.conversationMeta[id];
  try {
    conversations.value = await aiApi.deleteConversation(id);
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
  resolveToolApproval(conversationId, "deny");
  void aiApi.cancelChat(conversationId);
}

function buildContextTurns(messages: ChatMessage[], excludeId: string): PromptTurn[] {
  const valid = messages.filter(
    (m) => m.id !== excludeId && !m.error && (m.content.trim().length > 0 || Boolean(m.attachments?.length)),
  );
  return valid.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.content, attachments: m.attachments }
      : { role: "assistant", content: m.content },
  );
}

async function persistMessage(conversationId: string, msg: ChatMessage): Promise<string | null> {
  try {
    const res = await aiApi.upsertMessage(conversationId, msg);
    if (!msg.id) msg.id = res.id;
    conversations.value = res.conversations;
    return res.id;
  } catch (error) {
    showError(error);
    return null;
  }
}

async function runAssistantTurn(conv: Conversation): Promise<void> {
  const model =
    findConfiguredModel(conv.modelConfigId, conv.providerId, conv.modelId) ??
    findConfiguredModel(currentModelConfigId.value) ??
    resolveFallbackModel();
  if (!model) {
    throw new Error(t("ai.errors.noModelConfigured"));
  }

  if (
    conv.modelConfigId !== model.id ||
    conv.providerId !== model.providerId ||
    conv.modelId !== model.modelId
  ) {
    conv.modelConfigId = model.id;
    conv.providerId = model.providerId;
    conv.modelId = model.modelId;
    conv.updatedAt = formatNowDateTime();
    await upsertConversationRow(conv);
  }

  const assistantMsg = reactive<ChatMessage>({
    id: "",
    role: "assistant",
    content: "",
    reasoning: "",
    parts: [],
    createdAt: formatNowDateTime(),
    modelConfigId: model.id,
    providerName: resolveModelProviderName(model, locale.value),
    modelId: model.modelId,
    modelName: model.name || model.modelId,
  });
  conv.messages.push(assistantMsg);
  conv.updatedAt = formatNowDateTime();
  await persistMessage(conv.id, assistantMsg);

  const appendPart = (type: "reasoning" | "text", deltaText: string) => {
    const parts = assistantMsg.parts!;
    const last = parts[parts.length - 1];
    if (last && last.type === type) {
      last.text += deltaText;
    } else {
      parts.push(reactive({ id: nextPartKey(), type, text: deltaText }) as ChatMessagePart);
    }
  };

  streamingIds[conv.id] = true;
  const started = performance.now();

  try {
    const toolCallById = new Map<string, ChatToolCall>();
    const handleBackendEvent = (event: BackendChatEvent) => {
      switch (event.type) {
        case "reasoningDelta":
          assistantMsg.reasoning = (assistantMsg.reasoning ?? "") + event.text;
          appendPart("reasoning", event.text);
          break;
        case "contentDelta":
          assistantMsg.content += event.text;
          appendPart("text", event.text);
          break;
        case "roundSeparator":
          if (assistantMsg.content && !assistantMsg.content.endsWith("\n")) {
            assistantMsg.content += "\n\n";
          }
          break;
        case "toolCallStart": {
          const uiCall = reactive<ChatToolCall>({
            id: event.id,
            serverId: event.serverId,
            serverName: event.serverName,
            toolName: event.toolName,
            argumentsText: event.argumentsText || "{}",
            status: "running",
          });
          toolCallById.set(event.id, uiCall);
          assistantMsg.parts!.push({ id: nextPartKey(), type: "tool", call: uiCall });
          break;
        }
        case "approvalRequired":
          pendingApprovals[event.conversationId] = {
            id: event.id,
            conversationId: event.conversationId,
            toolName: event.toolName,
            kind: event.kind,
            ...(event.command !== undefined ? { command: event.command } : {}),
            ...(event.shell !== undefined ? { shell: event.shell } : {}),
            ...(event.targetPath !== undefined ? { targetPath: event.targetPath } : {}),
            ...(event.cwd !== undefined ? { cwd: event.cwd } : {}),
            ...(event.argumentsText !== undefined ? { argumentsText: event.argumentsText } : {}),
          };
          break;
        case "approvalCleared":
          delete pendingApprovals[event.conversationId];
          break;
        case "sessionPolicyChanged":
          if (conv.executionPolicy !== event.executionPolicy) {
            conv.executionPolicy = event.executionPolicy;
            conv.updatedAt = formatNowDateTime();
            void upsertConversationRow(conv);
          }
          break;
        case "toolCallResult": {
          const uiCall = toolCallById.get(event.id);
          if (uiCall) {
            uiCall.status = event.status;
            uiCall.resultText = event.resultText;
            if (event.status === "done" && event.outputFile) {
              uiCall.outputFile = event.outputFile;
              if (event.outputFile.kind === "image") {
                invalidateLocalImageCache(event.outputFile.path);
              }
            }
          }
          break;
        }
        case "notice":
          showError(event.message);
          break;
      }
    };

    const runResult = await aiApi.runChat(
      {
        conversationId: conv.id,
        modelConfigId: model.id,
        messages: buildContextTurns(conv.messages, assistantMsg.id),
        ...(conv.workspaceDir ? { workspaceDir: conv.workspaceDir } : {}),
        ...(conv.executionPolicy ? { executionPolicy: conv.executionPolicy } : {}),
        thinkingEffort: resolveThinkingEffort(model),
        enabledMcpIds: [...config.value.enabledMcpIds],
        builtinToolBadge: t("ai.builtinToolBadge"),
      },
      handleBackendEvent,
    );
    assistantMsg.durationMs = runResult.durationMs;
    if (runResult.inputTokens !== undefined) {
      assistantMsg.inputTokens = runResult.inputTokens;
    }
    if (runResult.outputTokens !== undefined) {
      assistantMsg.outputTokens = runResult.outputTokens;
    }
    if (runResult.totalTokens !== undefined) {
      assistantMsg.totalTokens = runResult.totalTokens;
    }
    if (runResult.aborted) {
      assistantMsg.aborted = true;
    }
  } catch (error) {
    assistantMsg.durationMs = Math.round(performance.now() - started);
    const msg = error instanceof Error ? error.message : String(error);
    assistantMsg.error = msg;
    showError(msg);
  } finally {
    delete pendingApprovals[conv.id];
    streamingIds[conv.id] = false;
    conv.updatedAt = formatNowDateTime();
    await persistMessage(conv.id, assistantMsg);
  }
}

export async function sendMessage(
  text: string,
  attachments: ChatAttachment[] = [],
): Promise<boolean> {
  const trimmed = text.trim();
  const files = attachments.filter((item) =>
    Boolean(item.rawFile || item.filePath || item.dataUrl || item.textContent !== undefined),
  );
  if (!trimmed && !files.length) return false;

  const model = findConfiguredModel(currentModelConfigId.value) ?? resolveFallbackModel();
  if (!model) {
    showError(t("ai.errors.noModelConfigured"));
    return false;
  }

  let conv = activeConversation.value;
  if (conv && streamingIds[conv.id]) return false;

  const now = formatNowDateTime();
  const initialTitle = trimmed ? makeTitleFromText(trimmed) : makeTitleFromText(files[0].name);
  if (!conv) {
    conv = reactive<Conversation>({
      id: "",
      title: initialTitle,
      modelConfigId: model.id,
      providerId: model.providerId,
      modelId: model.modelId,
      ...(draft.workspaceDir ? { workspaceDir: draft.workspaceDir } : {}),
      ...(draft.executionPolicy === "auto" ? { executionPolicy: "auto" as const } : {}),
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      messages: [],
    });
    const id = await upsertConversationRow(conv);
    if (!id) return false;
    conversationCache[id] = conv;
    activeConversationId.value = id;
    if (draft.pinned || draft.folderId) {
      moveConversation(id, { pinned: draft.pinned, folderId: draft.folderId || undefined });
    }
  } else if (conv.messages.length === 0 && conv.title === t("ai.newChat")) {
    conv.title = initialTitle;
    conv.updatedAt = now;
    await upsertConversationRow(conv);
  }

  let persistedFiles: ChatAttachment[] = [];
  if (files.length) {
    try {
      const wsDir = await resolveConversationWorkspaceDir(conv.id, conv.workspaceDir);
      persistedFiles = await persistAttachmentsToWorkspace(files, wsDir);
    } catch (error) {
      showError(error);
      return false;
    }
  }

  const userMsg = reactive<ChatMessage>({
    id: "",
    role: "user",
    content: trimmed,
    ...(persistedFiles.length ? { attachments: persistedFiles } : {}),
    createdAt: now,
  });
  conv.messages.push(userMsg);
  conv.updatedAt = now;
  const userMsgId = await persistMessage(conv.id, userMsg);
  if (!userMsgId) {
    const idx = conv.messages.indexOf(userMsg);
    if (idx >= 0) conv.messages.splice(idx, 1);
    return false;
  }

  try {
    await runAssistantTurn(conv);
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

export async function regenerateMessage(messageId: string): Promise<void> {
  const conv = activeConversation.value;
  if (!conv || streamingIds[conv.id]) return;
  const idx = conv.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  const target = conv.messages[idx];
  const inclusive = target.role === "assistant";
  if (inclusive) {
    conv.messages.splice(idx);
  } else {
    conv.messages.splice(idx + 1);
  }
  if (!conv.messages.some((m) => m.role === "user")) return;
  try {
    conversations.value = await aiApi.truncateMessagesFrom(conv.id, messageId, inclusive);
    await runAssistantTurn(conv);
  } catch (error) {
    showError(error);
  }
}

export async function editAndResendMessage(
  messageId: string,
  newContent: string,
): Promise<void> {
  const trimmed = newContent.trim();
  const conv = activeConversation.value;
  if (!trimmed || !conv || streamingIds[conv.id]) return;
  const idx = conv.messages.findIndex((m) => m.id === messageId);
  if (idx < 0 || conv.messages[idx].role !== "user") return;
  conv.messages[idx].content = trimmed;
  conv.messages.splice(idx + 1);
  try {
    await aiApi.truncateMessagesFrom(conv.id, messageId, false);
    const res = await aiApi.upsertMessage(conv.id, conv.messages[idx]);
    conversations.value = res.conversations;
    await runAssistantTurn(conv);
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
  conv.updatedAt = formatNowDateTime();
  try {
    conversations.value = await aiApi.deleteMessage(conv.id, messageId);
  } catch (error) {
    showError(error);
  }
}

export async function clearConversationMessages(): Promise<void> {
  const conv = activeConversation.value;
  if (!conv || streamingIds[conv.id]) return;
  conv.messages = [];
  conv.updatedAt = formatNowDateTime();
  try {
    conversations.value = await aiApi.clearMessages(conv.id);
  } catch (error) {
    showError(error);
  }
}

export function useAiStore() {
  return {
    config,
    builtinTools,
    enabledBuiltinToolsCount,
    conversations,
    activeConversationId,
    activeConversation,
    availableModels,
    currentModelConfigId,
    currentWorkspaceDir,
    currentExecutionPolicy,
    currentPendingApproval,
    isCurrentStreaming,
    initialized,
    loading,
    initAiStore,
    upsertModel,
    deleteModel,
    setDefaultModel,
    setModelEnabled,
    setEnabledMcpIds,
    setDisabledBuiltinTools,
    setBuiltinToolEnabled,
    setAllBuiltinToolsEnabled,
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
    setCurrentWorkspaceDir,
    setCurrentExecutionPolicy,
    resolveToolApproval,
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
