/**
 * AI 模块完整类型定义（模型配置、对话消息、附件、审批状态与流式事件）。
 */

import type {
  AiBuiltinToolInfo as GeneratedAiBuiltinToolInfo,
  ApprovalKind as GeneratedApprovalKind,
  ToolApprovalPolicy as GeneratedToolApprovalPolicy,
  ToolCallStatus as GeneratedToolCallStatus,
  ToolOutputFileKind as GeneratedToolOutputFileKind,
} from "@/api/generated/ai";

export type ApiProtocol = "openai" | "anthropic" | "gemini";

export type AiBuiltinToolInfo = GeneratedAiBuiltinToolInfo;
export type ApprovalKind = GeneratedApprovalKind;
export type ToolApprovalPolicy = GeneratedToolApprovalPolicy;
export type ToolCallStatus = GeneratedToolCallStatus;
export type ToolOutputFileKind = GeneratedToolOutputFileKind;

export type ThinkingEffort = "none" | "low" | "medium" | "high";

export type ThinkingSupportMode = "auto" | "enabled" | "disabled";

export interface ProviderPreset {
  id: string;
  name: string;
  protocol: ApiProtocol;
  baseUrl: string;
  requiresKey: boolean;
  sampleModels: string[];
}

export interface EndpointConfig {
  protocol: ApiProtocol;
  baseUrl: string;
  apiKey: string;
  requiresKey?: boolean;
}

export interface RemoteModelInfo {
  id: string;
  name?: string;
}

/** 单条已配置的模型记录视图（不含明文 API Key，仅保留脱敏展示与是否已配置标记） */
export interface ConfiguredModel {
  id: string;
  providerId: string;
  /** 自定义厂商名称（选择自定义接口或代理网关时可填，优先于预设厂商名展示） */
  providerName?: string;
  name: string;
  protocol: ApiProtocol;
  baseUrl: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  modelId: string;
  enabled: boolean;
  isDefault: boolean;
  /** 单次回复最大输出 Token 数（留空使用模型默认上限） */
  maxTokens?: number | null;
  /** 是否支持调节思考等级：auto 根据模型 ID 自动识别，也可手动强制开启或关闭 */
  thinkingSupport?: ThinkingSupportMode;
  /** 当前为该模型选择的思考等级 */
  thinkingEffort?: ThinkingEffort;
}

/** 新增或编辑模型时的提交载荷：apiKey 为 null/undefined 时保持后端已加密密钥不变 */
export interface AiModelUpsertInput {
  id: string;
  providerId: string;
  providerName?: string | null;
  name: string;
  protocol: ApiProtocol;
  baseUrl: string;
  apiKey?: string | null;
  modelId: string;
  enabled: boolean;
  maxTokens?: number | null;
  thinkingSupport?: ThinkingSupportMode | null;
  thinkingEffort?: ThinkingEffort | null;
  isDefault?: boolean | null;
}

/** 会话文件夹（可位于固定会话区或普通会话区） */
export interface AiFolder {
  id: string;
  name: string;
  pinned: boolean;
  collapsed: boolean;
  createdAt: string;
}

/** 会话在侧栏中的归属与排序元信息（固定状态、所属文件夹与自定义顺序） */
export interface AiConversationMeta {
  pinned?: boolean;
  folderId?: string;
  order?: number;
}

export interface AiConversationMetaUpdate {
  conversationId: string;
  pinned: boolean;
  folderId?: string | null;
  order?: number | null;
}

export interface AiConfig {
  models: ConfiguredModel[];
  /** 在 AI 对话中启用的 MCP 服务 ID（对应 MCP 工具查看器中的连接 ID） */
  enabledMcpIds: string[];
  /** 在 AI 对话中禁用的内置工具名列表（空数组表示默认全部启用） */
  disabledBuiltinTools: string[];
  folders: AiFolder[];
  conversationMeta: Record<string, AiConversationMeta>;
}

export interface AiInitialState extends AiConfig {
  builtinTools: AiBuiltinToolInfo[];
  conversations: ConversationSummary[];
}

export interface ChatToolCall {
  id: string;
  serverId: string;
  serverName: string;
  toolName: string;
  argumentsText: string;
  resultText?: string;
  status: "running" | ToolCallStatus;
  /** 写/改文件或生成图片类工具成功完成后记录的最新文件快照，供右侧「输出内容」展示 */
  outputFile?: {
    path: string;
    content: string;
    kind?: ToolOutputFileKind;
    sizeBytes?: number;
  };
}

export type ToolApprovalDecision = "once" | "session" | "deny";

/** 会话的命令与外部写入执行策略：review 逐次确认（默认），auto 全部自动通过 */
export type ExecutionPolicy = "review" | "auto";

export interface PendingToolApproval {
  id: string;
  conversationId: string;
  toolName: string;
  kind: ApprovalKind;
  command?: string;
  shell?: string;
  targetPath?: string;
  cwd?: string;
  argumentsText?: string;
}

/** 助手回复的有序时间线分段，使思考过程、说明文字与工具调用按真实发生顺序交错展示 */
export type ChatMessagePart =
  | { id: string; type: "reasoning"; text: string }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "tool"; call: ChatToolCall };

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "text" | "file";
  /** 落盘在当前会话工作目录 `uploads/` 中的完整路径 */
  filePath?: string;
  /** 兼容旧版会话或非桌面运行态的图片 base64 Data URL */
  dataUrl?: string;
  /** 文本/代码类附件读取出的正文内容（超长时按上限截断） */
  textContent?: string;
  /** 文本正文是否因超出上下文上限被截断 */
  truncated?: boolean;
  /** 仅用于输入框待发送缩略图预览的临时 blob URL（不持久化） */
  previewUrl?: string;
  /** 仅用于发送前无损落盘的原始 File 对象（不持久化） */
  rawFile?: File;
}

export interface SavedAttachmentResponse {
  path: string;
  fileName: string;
  sizeBytes: number;
}

export interface LocalImagePreview {
  path: string;
  mimeType: string;
  dataUrl: string;
  rawBase64?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface AiReadFileResult {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  reasoning?: string;
  /** 按发生顺序记录的分段内容（含思考、正文与工具调用）；旧消息缺省时界面自动回退渲染 */
  parts?: ChatMessagePart[];
  createdAt: string;
  modelConfigId?: string;
  providerName?: string;
  modelId?: string;
  modelName?: string;
  durationMs?: number;
  error?: string;
  aborted?: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Conversation extends ConversationSummary {
  modelConfigId?: string;
  /** 用户为该会话绑定的自定义本地工作目录；留空时使用程序内置会话独立目录 */
  workspaceDir?: string;
  /** 本会话的命令执行策略：默认逐次确认（review），也可切换为自动放行（auto） */
  executionPolicy?: ExecutionPolicy;
  messages: ChatMessage[];
}

export interface ModelOption {
  value: string;
  modelConfigId: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelLabel: string;
  supportedEfforts: ThinkingEffort[];
  thinkingEffort?: ThinkingEffort;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  argumentsText: string;
}

export type PromptTurn =
  | { role: "user"; content: string; attachments?: ChatAttachment[] }
  | { role: "assistant"; content: string; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

export interface BackendChatRunRequest {
  conversationId: string;
  modelConfigId: string;
  messages: PromptTurn[];
  workspaceDir?: string;
  executionPolicy?: ExecutionPolicy;
  thinkingEffort?: ThinkingEffort;
  enabledMcpIds: string[];
  builtinToolBadge?: string;
}

export type BackendChatEvent =
  | { type: "reasoningDelta"; text: string }
  | { type: "contentDelta"; text: string }
  | { type: "roundSeparator" }
  | {
      type: "toolCallStart";
      id: string;
      serverId: string;
      serverName: string;
      toolName: string;
      argumentsText: string;
    }
  | {
      type: "approvalRequired";
      id: string;
      conversationId: string;
      toolName: string;
      kind: ApprovalKind;
      command?: string;
      shell?: string;
      targetPath?: string;
      cwd?: string;
      argumentsText?: string;
    }
  | { type: "approvalCleared"; conversationId: string }
  | { type: "sessionPolicyChanged"; executionPolicy: ExecutionPolicy }
  | {
      type: "toolCallResult";
      id: string;
      status: ToolCallStatus;
      resultText: string;
      outputFile?: ChatToolCall["outputFile"];
    }
  | { type: "notice"; message: string };

export interface BackendChatRunResult {
  aborted: boolean;
  durationMs: number;
}
