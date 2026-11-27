/**
 * AI 模块后端 API 定义：
 * - 所有 JSON / Channel 命令直接调用 `tauri-specta` 自动生成的强类型 `commands`（`@/api/generated/ai`）；
 * - 统一经过 `@/api/common` 的桌面运行态检查与 `BackendError` 错误拦截器；
 * - 负责将后端 DTO 与前端领域类型做轻量转换。
 */
import { Channel } from "@tauri-apps/api/core";
import { BackendError, executeGeneratedCommand, requestBackend, unwrapApiResponse } from "@/api/common";
import {
  commands,
  type AiChatEvent_Deserialize,
  type AiConversationDetail_Serialize,
  type AiConversationMetaDto_Serialize,
  type AiFolderDto,
  type AiMessageDto_Deserialize,
  type AiMessageDto_Serialize,
  type AiModelView_Serialize,
  type ConversationIndexEntry_Serialize,
} from "@/api/generated/ai";
import { t } from "@/locales";
import type { ApiResponsePayload } from "@/types/common";
import type {
  AiConversationMeta,
  AiConversationMetaUpdate,
  AiFolder,
  AiInitialState,
  AiModelUpsertInput,
  AiReadFileResult,
  BackendChatEvent,
  BackendChatRunRequest,
  BackendChatRunResult,
  ChatAttachment,
  ChatMessage,
  ChatMessagePart,
  ChatToolCall,
  ConfiguredModel,
  Conversation,
  ConversationSummary,
  EndpointConfig,
  ExecutionPolicy,
  LocalImagePreview,
  RemoteModelInfo,
  SavedAttachmentResponse,
  ThinkingEffort,
  ThinkingSupportMode,
  ToolApprovalDecision,
} from "@/types/ai";

function stripTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function parseJsonField<T>(raw?: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function toThinkingSupport(raw?: string | null): ThinkingSupportMode | undefined {
  return raw === "auto" || raw === "enabled" || raw === "disabled" ? raw : undefined;
}

function toExecutionPolicy(raw?: string | null): ExecutionPolicy | undefined {
  return raw === "auto" || raw === "review" ? raw : undefined;
}

function toConfiguredModel(item: AiModelView_Serialize): ConfiguredModel {
  return {
    id: item.id,
    providerId: item.providerId,
    ...(item.providerName ? { providerName: item.providerName } : {}),
    name: item.name,
    protocol: item.protocol,
    baseUrl: item.baseUrl,
    hasApiKey: item.hasApiKey,
    maskedApiKey: item.maskedApiKey,
    modelId: item.modelId,
    enabled: item.enabled,
    isDefault: item.isDefault,
    maxTokens: item.maxTokens ?? null,
    thinkingSupport: toThinkingSupport(item.thinkingSupport),
    thinkingEffort: item.thinkingEffort,
  };
}

function toFolder(item: AiFolderDto): AiFolder {
  return {
    id: item.id,
    name: item.name,
    pinned: item.pinned,
    collapsed: item.collapsed,
    createdAt: item.createdAt ?? 0,
  };
}

function toConversationMeta(dto: AiConversationMetaDto_Serialize): AiConversationMeta {
  return {
    ...(dto.pinned ? { pinned: true } : {}),
    ...(dto.folderId ? { folderId: dto.folderId } : {}),
    ...(dto.order !== undefined ? { order: dto.order } : {}),
  };
}

function toConversationSummary(item: ConversationIndexEntry_Serialize): ConversationSummary {
  return {
    id: item.id,
    title: item.title,
    providerId: item.providerId,
    modelId: item.modelId,
    createdAt: item.createdAt ?? 0,
    updatedAt: item.updatedAt ?? 0,
    messageCount: item.messageCount,
  };
}

function normalizeLegacyParts(
  rawParts: ChatMessagePart[] | undefined,
  reasoning: string | undefined,
  legacyToolCalls: ChatToolCall[] | undefined,
  content: string,
): ChatMessagePart[] | undefined {
  if (rawParts?.length) return rawParts;
  if (!legacyToolCalls?.length) return undefined;
  const parts: ChatMessagePart[] = [];
  if (reasoning) {
    parts.push({ id: "legacy-reasoning", type: "reasoning", text: reasoning });
  }
  for (const call of legacyToolCalls) {
    parts.push({ id: `legacy-tool-${call.id}`, type: "tool", call });
  }
  if (content) {
    parts.push({ id: "legacy-text", type: "text", text: content });
  }
  return parts;
}

function toChatMessage(dto: AiMessageDto_Serialize): ChatMessage {
  const attachments = parseJsonField<ChatAttachment[]>(dto.attachmentsJson);
  const legacyToolCalls = parseJsonField<ChatToolCall[]>(dto.toolCallsJson);
  const parts = normalizeLegacyParts(
    parseJsonField<ChatMessagePart[]>(dto.partsJson),
    dto.reasoning || undefined,
    legacyToolCalls,
    dto.content,
  );
  return {
    id: dto.id,
    role: dto.role === "assistant" ? "assistant" : "user",
    content: dto.content,
    ...(attachments?.length ? { attachments } : {}),
    ...(dto.reasoning ? { reasoning: dto.reasoning } : {}),
    ...(parts?.length ? { parts } : {}),
    createdAt: dto.createdAt ?? 0,
    ...(dto.modelConfigId ? { modelConfigId: dto.modelConfigId } : {}),
    ...(dto.providerName ? { providerName: dto.providerName } : {}),
    ...(dto.modelId ? { modelId: dto.modelId } : {}),
    ...(dto.modelName ? { modelName: dto.modelName } : {}),
    ...(dto.durationMs !== null && dto.durationMs !== undefined ? { durationMs: dto.durationMs } : {}),
    ...(dto.error ? { error: dto.error } : {}),
    ...(dto.aborted ? { aborted: true } : {}),
  };
}

function toMessageDto(msg: ChatMessage): AiMessageDto_Deserialize {
  const attachments = msg.attachments?.map(({ previewUrl: _p, rawFile: _r, ...rest }) => rest);
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    reasoning: msg.reasoning ?? null,
    attachmentsJson: attachments?.length ? JSON.stringify(attachments) : null,
    // 工具调用统一以 partsJson 为唯一持久化真源，不再双份序列化写入 toolCallsJson
    toolCallsJson: null,
    partsJson: msg.parts?.length ? JSON.stringify(msg.parts) : null,
    modelConfigId: msg.modelConfigId ?? null,
    providerName: msg.providerName ?? null,
    modelId: msg.modelId ?? null,
    modelName: msg.modelName ?? null,
    durationMs: msg.durationMs ?? null,
    error: msg.error ?? null,
    aborted: Boolean(msg.aborted),
    createdAt: msg.createdAt,
  };
}

function toBackendChatEvent(ev: AiChatEvent_Deserialize): BackendChatEvent {
  switch (ev.type) {
    case "reasoningDelta":
    case "contentDelta":
    case "roundSeparator":
    case "toolCallStart":
    case "approvalCleared":
    case "sessionPolicyChanged":
    case "notice":
      return ev;
    case "approvalRequired":
      return {
        type: "approvalRequired",
        id: ev.id,
        conversationId: ev.conversationId,
        toolName: ev.toolName,
        kind: ev.kind,
        ...(ev.command ? { command: ev.command } : {}),
        ...(ev.shell ? { shell: ev.shell } : {}),
        ...(ev.targetPath ? { targetPath: ev.targetPath } : {}),
        ...(ev.cwd ? { cwd: ev.cwd } : {}),
        ...(ev.argumentsText ? { argumentsText: ev.argumentsText } : {}),
      };
    case "toolCallResult":
      return {
        type: "toolCallResult",
        id: ev.id,
        status: ev.status,
        resultText: ev.resultText,
        ...(ev.outputFile
          ? {
              outputFile: {
                path: ev.outputFile.path,
                content: ev.outputFile.content,
                ...(ev.outputFile.kind ? { kind: ev.outputFile.kind } : {}),
                ...(ev.outputFile.sizeBytes !== null && ev.outputFile.sizeBytes !== undefined
                  ? { sizeBytes: ev.outputFile.sizeBytes }
                  : {}),
              },
            }
          : {}),
      };
  }
}

function toConversation(detail: AiConversationDetail_Serialize): Conversation {
  return {
    id: detail.id,
    title: detail.title,
    ...(detail.modelConfigId ? { modelConfigId: detail.modelConfigId } : {}),
    providerId: detail.providerId,
    modelId: detail.modelId,
    ...(detail.workspaceDir ? { workspaceDir: detail.workspaceDir } : {}),
    ...(toExecutionPolicy(detail.executionPolicy) ? { executionPolicy: toExecutionPolicy(detail.executionPolicy) } : {}),
    createdAt: detail.createdAt ?? 0,
    updatedAt: detail.updatedAt ?? 0,
    messageCount: detail.messageCount,
    messages: detail.messages.map(toChatMessage),
  };
}

export const aiApi = {
  // ---------- 初始化与细粒度 SQLite 状态操作 ----------
  async loadState(): Promise<AiInitialState> {
    const state = await executeGeneratedCommand(() => commands.aiLoadState());
    const conversationMeta: Record<string, AiConversationMeta> = {};
    for (const [id, meta] of Object.entries(state.conversationMeta)) {
      if (meta) conversationMeta[id] = toConversationMeta(meta);
    }
    return {
      models: state.models.map(toConfiguredModel),
      enabledMcpIds: state.enabledMcpIds,
      disabledBuiltinTools: state.disabledBuiltinTools,
      builtinTools: state.builtinTools,
      folders: state.folders.map(toFolder),
      conversationMeta,
      conversations: state.conversations.map(toConversationSummary),
    };
  },

  async upsertModel(input: AiModelUpsertInput): Promise<ConfiguredModel[]> {
    const list = await executeGeneratedCommand(() =>
      commands.aiUpsertModel({
        id: input.id,
        providerId: input.providerId,
        providerName: input.providerName ?? null,
        name: input.name,
        protocol: input.protocol,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey ?? null,
        modelId: input.modelId,
        enabled: input.enabled,
        maxTokens: input.maxTokens ?? null,
        thinkingSupport: input.thinkingSupport ?? null,
        thinkingEffort: input.thinkingEffort ?? null,
        isDefault: input.isDefault ?? null,
      }),
    );
    return list.map(toConfiguredModel);
  },

  async deleteModel(id: string): Promise<ConfiguredModel[]> {
    const list = await executeGeneratedCommand(() => commands.aiDeleteModel(id));
    return list.map(toConfiguredModel);
  },

  async setDefaultModel(id: string | null): Promise<ConfiguredModel[]> {
    const list = await executeGeneratedCommand(() => commands.aiSetDefaultModel(id));
    return list.map(toConfiguredModel);
  },

  async setModelEnabled(id: string, enabled: boolean): Promise<ConfiguredModel[]> {
    const list = await executeGeneratedCommand(() => commands.aiSetModelEnabled(id, enabled));
    return list.map(toConfiguredModel);
  },

  async setModelThinkingEffort(id: string, effort: ThinkingEffort): Promise<void> {
    await executeGeneratedCommand(() => commands.aiSetModelThinkingEffort(id, effort));
  },

  async setEnabledMcpIds(ids: string[]): Promise<void> {
    await executeGeneratedCommand(() => commands.aiSetEnabledMcpIds(ids));
  },

  async setDisabledBuiltinTools(names: string[]): Promise<void> {
    await executeGeneratedCommand(() => commands.aiSetDisabledBuiltinTools(names));
  },

  async upsertFolder(folder: AiFolder): Promise<AiFolder> {
    const saved = await executeGeneratedCommand(() =>
      commands.aiUpsertFolder({
        id: folder.id,
        name: folder.name,
        pinned: folder.pinned,
        collapsed: folder.collapsed,
        createdAt: folder.createdAt,
      }),
    );
    return toFolder(saved);
  },

  async deleteFolder(id: string): Promise<void> {
    await executeGeneratedCommand(() => commands.aiDeleteFolder(id));
  },

  async readConversation(id: string): Promise<Conversation | null> {
    const detail = await executeGeneratedCommand(() => commands.aiReadConversation(id));
    return detail ? toConversation(detail) : null;
  },

  async upsertConversation(
    conv: Pick<
      Conversation,
      | "id"
      | "title"
      | "modelConfigId"
      | "providerId"
      | "modelId"
      | "workspaceDir"
      | "executionPolicy"
      | "createdAt"
      | "updatedAt"
    >,
  ): Promise<{ id: string; conversations: ConversationSummary[] }> {
    const res = await executeGeneratedCommand(() =>
      commands.aiUpsertConversation({
        id: conv.id,
        title: conv.title,
        modelConfigId: conv.modelConfigId ?? null,
        providerId: conv.providerId,
        modelId: conv.modelId,
        workspaceDir: conv.workspaceDir ?? null,
        executionPolicy: conv.executionPolicy ?? null,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      }),
    );
    return {
      id: res.id,
      conversations: res.conversations.map(toConversationSummary),
    };
  },

  async updateConversationMeta(updates: AiConversationMetaUpdate[]): Promise<void> {
    await executeGeneratedCommand(() =>
      commands.aiUpdateConversationMeta(
        updates.map((u) => ({
          conversationId: u.conversationId,
          pinned: u.pinned,
          folderId: u.folderId ?? null,
          order: u.order ?? null,
        })),
      ),
    );
  },

  async deleteConversation(id: string): Promise<ConversationSummary[]> {
    const list = await executeGeneratedCommand(() => commands.aiDeleteConversation(id));
    return list.map(toConversationSummary);
  },

  async upsertMessage(
    conversationId: string,
    message: ChatMessage,
  ): Promise<{ id: string; conversations: ConversationSummary[] }> {
    const res = await executeGeneratedCommand(() =>
      commands.aiUpsertMessage(conversationId, toMessageDto(message)),
    );
    return {
      id: res.id,
      conversations: res.conversations.map(toConversationSummary),
    };
  },

  async deleteMessage(conversationId: string, messageId: string): Promise<ConversationSummary[]> {
    const list = await executeGeneratedCommand(() =>
      commands.aiDeleteMessage(conversationId, messageId),
    );
    return list.map(toConversationSummary);
  },

  async truncateMessagesFrom(
    conversationId: string,
    fromMessageId: string,
    inclusive: boolean,
  ): Promise<ConversationSummary[]> {
    const list = await executeGeneratedCommand(() =>
      commands.aiTruncateMessagesFrom(conversationId, fromMessageId, inclusive),
    );
    return list.map(toConversationSummary);
  },

  async clearMessages(conversationId: string): Promise<ConversationSummary[]> {
    const list = await executeGeneratedCommand(() => commands.aiClearMessages(conversationId));
    return list.map(toConversationSummary);
  },

  // ---------- 大模型对话引擎与模型列表 ----------
  async runChat(
    request: BackendChatRunRequest,
    onEvent: (event: BackendChatEvent) => void,
  ): Promise<BackendChatRunResult> {
    if (!request.modelConfigId.trim()) {
      throw new BackendError("invalidInput", t("ai.errors.noModelConfigured"));
    }
    const res = await executeGeneratedCommand(() => {
      const channel = new Channel<AiChatEvent_Deserialize>();
      channel.onmessage = (ev) => onEvent(toBackendChatEvent(ev));
      return commands.aiChatRun(request, channel);
    });
    return {
      aborted: res.aborted,
      durationMs: res.durationMs ?? 0,
    };
  },

  approveTool(conversationId: string, decision: ToolApprovalDecision): Promise<boolean> {
    return executeGeneratedCommand(
      () => commands.aiChatApprove(conversationId, decision),
      () => false,
    );
  },

  cancelChat(conversationId: string): Promise<boolean> {
    return executeGeneratedCommand(
      () => commands.aiChatCancel(conversationId),
      () => false,
    );
  },

  async setExecutionPolicy(conversationId: string, policy: ExecutionPolicy): Promise<void> {
    await executeGeneratedCommand(
      () => commands.aiChatSetPolicy(conversationId, policy),
      () => null,
    );
  },

  async clearChatSession(conversationId: string): Promise<void> {
    await executeGeneratedCommand(
      () => commands.aiChatClearSession(conversationId),
      () => null,
    );
  },

  async fetchEndpointModels(
    endpoint: EndpointConfig,
    modelConfigId?: string | null,
  ): Promise<RemoteModelInfo[]> {
    if (!stripTrailingSlash(endpoint.baseUrl)) {
      throw new BackendError("invalidInput", t("ai.errors.missingBaseUrl"));
    }
    if (endpoint.requiresKey && !endpoint.apiKey.trim() && !modelConfigId) {
      throw new BackendError("unauthorized", t("ai.errors.missingApiKey"));
    }
    const list = await executeGeneratedCommand(() =>
      commands.aiFetchModels(endpoint, modelConfigId ?? null),
    );
    return list.map((item) => ({
      id: item.id,
      ...(item.name ? { name: item.name } : {}),
    }));
  },

  // ---------- 工作区、附件与本地预览 ----------
  workspaceDir(conversationId: string): Promise<string> {
    return executeGeneratedCommand(
      () => commands.aiWorkspaceDir(conversationId),
      () => `data/ai/workspaces/${conversationId}`,
    );
  },

  async saveAttachment(
    buffer: ArrayBuffer,
    headers: Record<string, string>,
  ): Promise<SavedAttachmentResponse> {
    const res = await requestBackend<ApiResponsePayload<SavedAttachmentResponse>>(
      "ai_save_attachment",
      buffer,
      { headers },
    );
    return unwrapApiResponse(res);
  },

  readFile(
    workspaceDir: string,
    path: string,
    startLine: number,
    endLine: number,
  ): Promise<AiReadFileResult> {
    return executeGeneratedCommand(() =>
      commands.aiToolReadFile(workspaceDir, path, startLine, endLine),
    );
  },

  async readImage(workspaceDir: string, path: string): Promise<LocalImagePreview> {
    const res = await executeGeneratedCommand(() => commands.aiToolReadImage(workspaceDir, path));
    return {
      path: res.path,
      mimeType: res.mimeType,
      dataUrl: res.dataUrl,
      ...(res.rawBase64 ? { rawBase64: res.rawBase64 } : {}),
      sizeBytes: res.sizeBytes ?? 0,
      ...(res.width !== undefined ? { width: res.width } : {}),
      ...(res.height !== undefined ? { height: res.height } : {}),
    };
  },
};
