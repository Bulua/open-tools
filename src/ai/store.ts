import { computed, reactive, ref } from "vue";
import { locale, t } from "@/locales";
import { showError } from "@/utils/errorToast";
import {
  checkBuiltinToolPath,
  invokeBuiltinTool,
  loadBuiltinAiContext,
  setBuiltinContextTestProvider,
  setBuiltinToolTestExecutor,
} from "./builtinTools";
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
  AiConversationMeta,
  AiFolder,
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
  ThinkingEffort,
  ToolApprovalDecision,
} from "./types";

const MAX_TOOL_ROUNDS = 16;

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
const pendingApprovals = reactive<Record<string, PendingToolApproval>>({});
const approvalResolvers = new Map<string, (decision: ToolApprovalDecision) => void>();
const sessionApprovals = reactive<Record<string, { allowCommand: boolean; allowExternalWrite: boolean }>>({});

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

function getSessionApproval(conversationId: string) {
  if (!sessionApprovals[conversationId]) {
    sessionApprovals[conversationId] = { allowCommand: false, allowExternalWrite: false };
  }
  return sessionApprovals[conversationId];
}

export function resolveToolApproval(conversationId: string, decision: ToolApprovalDecision): void {
  const pending = pendingApprovals[conversationId];
  if (pending && decision === "session") {
    const perms = getSessionApproval(conversationId);
    perms.allowCommand = true;
    perms.allowExternalWrite = true;
    const conv = conversationCache[conversationId];
    if (conv && conv.executionPolicy !== "auto") {
      conv.executionPolicy = "auto";
      conv.updatedAt = Date.now();
      void persistConversation(conv);
    }
  }
  delete pendingApprovals[conversationId];
  const resolver = approvalResolvers.get(conversationId);
  if (resolver) {
    approvalResolvers.delete(conversationId);
    resolver(decision);
  }
}

export async function setCurrentExecutionPolicy(policy: ExecutionPolicy): Promise<void> {
  const conv = activeConversation.value;
  if (!conv) {
    draft.executionPolicy = policy;
    return;
  }
  conv.executionPolicy = policy;
  const perms = getSessionApproval(conv.id);
  perms.allowCommand = policy === "auto";
  perms.allowExternalWrite = policy === "auto";
  if (policy === "auto" && pendingApprovals[conv.id]) {
    resolveToolApproval(conv.id, "once");
  }
  conv.updatedAt = Date.now();
  await persistConversation(conv);
}

function requestToolApproval(
  approval: PendingToolApproval,
  signal: AbortSignal,
): Promise<ToolApprovalDecision> {
  if (signal.aborted) return Promise.resolve("deny");
  return new Promise((resolve) => {
    const onAbort = () => {
      resolveToolApproval(approval.conversationId, "deny");
    };
    signal.addEventListener("abort", onAbort, { once: true });
    approvalResolvers.set(approval.conversationId, (decision) => {
      signal.removeEventListener("abort", onAbort);
      resolve(decision);
    });
    pendingApprovals[approval.conversationId] = approval;
  });
}

export async function setCurrentWorkspaceDir(dir: string): Promise<void> {
  const trimmed = dir.trim();
  const conv = activeConversation.value;
  if (!conv) {
    draft.workspaceDir = trimmed;
    return;
  }
  conv.workspaceDir = trimmed || undefined;
  conv.updatedAt = Date.now();
  await persistConversation(conv);
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
  draft.workspaceDir = "";
  draft.executionPolicy = "review";
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
    return b.updatedAt - a.updatedAt;
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
  const shouldWriteOrder = Boolean(target.beforeId || target.afterId) || orderedIds.some((cid) => config.value.conversationMeta[cid]?.order !== undefined);

  if (shouldWriteOrder) {
    orderedIds.forEach((cid, idx) => {
      config.value.conversationMeta[cid] = {
        ...(pinned ? { pinned: true } : {}),
        ...(folderId ? { folderId } : {}),
        order: idx,
      };
    });
  } else if (!pinned && !folderId) {
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
  delete sessionApprovals[id];
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
  resolveToolApproval(conversationId, "deny");
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
  return valid.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.content, attachments: m.attachments }
      : { role: "assistant", content: m.content },
  );
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
    // 系统提示词与已注册的内置工具声明统一由 Rust 后端返回
    const builtinCtx = await loadBuiltinAiContext(conv.id, conv.workspaceDir);
    const workspaceDir = builtinCtx.workspaceDir;
    const systemPrompt = builtinCtx.systemPrompt;
    const builtinByName = new Map(builtinCtx.tools.map((tool) => [tool.name, tool]));
    const builtinToolDefs: ToolDefinition[] = builtinCtx.tools.map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));

    // 汇总内置本地工具与已启用的 MCP 工具
    const mcpEntries: ActiveMcpToolEntry[] = await collectEnabledMcpTools(config.value.enabledMcpIds);
    const mcpByFn = new Map(mcpEntries.map((entry) => [entry.functionName, entry]));
    const mcpToolDefs: ToolDefinition[] = mcpEntries.map((entry) => ({
      name: entry.functionName,
      description: entry.tool.description || entry.tool.title || entry.tool.name,
      parameters: entry.tool.inputSchema ?? { type: "object", properties: {} },
    }));
    const toolDefs: ToolDefinition[] = [...builtinToolDefs, ...mcpToolDefs];

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
        maxTokens: model.maxTokens ?? null,
        thinkingEffort: resolveThinkingEffort(model),
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

        const builtinTool = builtinByName.get(call.name);
        if (builtinTool) {
          const parsedArgs = parseJsonObjectSafe(call.argumentsText);
          const uiCall = reactive<ChatToolCall>({
            id: call.id,
            serverId: "__builtin__",
            serverName: t("ai.builtinToolBadge"),
            toolName: call.name,
            argumentsText: call.argumentsText || "{}",
            status: "running",
          });
          assistantMsg.toolCalls!.push(uiCall);
          assistantMsg.parts!.push({ id: makeEntityId("prt"), type: "tool", call: uiCall });

          let toolResultText = "";
          let approved = true;

          // 按后端工具声明的 approval 策略进行安全确认，新扩展工具自动遵循同一链路
          const autoAll = conv.executionPolicy === "auto";
          if (builtinTool.approval === "command" && !autoAll && !sessionApprovals[conv.id]?.allowCommand) {
            const isShellCommand = call.name === "run_command";
            const cmdStr = typeof parsedArgs.command === "string" ? parsedArgs.command : call.argumentsText;
            const shellStr = typeof parsedArgs.shell === "string" && parsedArgs.shell.trim() ? parsedArgs.shell.trim() : "powershell";
            const cwdStr = typeof parsedArgs.cwd === "string" && parsedArgs.cwd.trim() ? parsedArgs.cwd.trim() : workspaceDir;
            const formattedArgs = Object.keys(parsedArgs).length
              ? JSON.stringify(parsedArgs, null, 2)
              : call.argumentsText || "{}";
            const decision = await requestToolApproval(
              isShellCommand
                ? {
                    id: call.id,
                    conversationId: conv.id,
                    toolName: call.name,
                    kind: "command",
                    command: cmdStr,
                    shell: shellStr,
                    cwd: cwdStr,
                  }
                : {
                    id: call.id,
                    conversationId: conv.id,
                    toolName: call.name,
                    kind: "tool",
                    argumentsText: formattedArgs,
                  },
              controller.signal,
            );
            approved = decision !== "deny";
          } else if (
            builtinTool.approval === "externalWrite" &&
            !autoAll &&
            !sessionApprovals[conv.id]?.allowExternalWrite &&
            typeof parsedArgs.path === "string" &&
            parsedArgs.path.trim()
          ) {
            const check = await checkBuiltinToolPath(workspaceDir, parsedArgs.path);
            if (check.outsideWorkspace) {
              const decision = await requestToolApproval(
                {
                  id: call.id,
                  conversationId: conv.id,
                  toolName: call.name,
                  kind: "externalWrite",
                  targetPath: check.resolvedPath,
                },
                controller.signal,
              );
              approved = decision !== "deny";
            }
          }

          if (!approved || controller.signal.aborted) {
            uiCall.status = "error";
            toolResultText = controller.signal.aborted
              ? "Tool execution cancelled by user."
              : "User denied permission to run this tool.";
            uiCall.resultText = toolResultText;
          } else {
            const res = await invokeBuiltinTool(call.name, parsedArgs, workspaceDir, controller.signal);
            toolResultText = res.text;
            uiCall.status = res.isError ? "error" : "done";
            uiCall.resultText = toolResultText;
            if (!res.isError && res.outputFile) {
              uiCall.outputFile = res.outputFile;
            }
          }

          turns.push({
            role: "tool",
            toolCallId: call.id,
            toolName: call.name,
            content: toolResultText,
          });
          continue;
        }

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
      ...(draft.workspaceDir ? { workspaceDir: draft.workspaceDir } : {}),
      ...(draft.executionPolicy === "auto" ? { executionPolicy: "auto" as const } : {}),
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
  for (const id of Object.keys(pendingApprovals)) {
    resolveToolApproval(id, "deny");
  }
  for (const controller of activeControllers.values()) controller.abort();
  activeControllers.clear();
  for (const key of Object.keys(streamingIds)) delete streamingIds[key];
  for (const key of Object.keys(conversationCache)) delete conversationCache[key];
  for (const key of Object.keys(sessionApprovals)) delete sessionApprovals[key];
  setBuiltinToolTestExecutor(null);
  setBuiltinContextTestProvider(null);
  resetMcpStateForTest();
  config.value = createDefaultConfig();
  conversations.value = [];
  activeConversationId.value = "";
  draft.modelConfigId = "";
  draft.workspaceDir = "";
  draft.executionPolicy = "review";
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
    currentWorkspaceDir,
    currentExecutionPolicy,
    currentPendingApproval,
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
