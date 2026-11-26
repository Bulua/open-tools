export type ApiProtocol = "openai" | "anthropic" | "gemini";

export type ThinkingEffort = "none" | "low" | "medium" | "high";

export type ThinkingSupportMode = "auto" | "enabled" | "disabled";

/** 单条已配置的模型记录，允许用户自由新增、编辑、删除多个模型 */
export interface ConfiguredModel {
  id: string;
  providerId: string;
  name: string;
  protocol: ApiProtocol;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  enabled: boolean;
  /** 单次回复最大输出 Token 数（留空使用模型默认上限） */
  maxTokens?: number | null;
  /** 是否支持调节思考等级：auto 根据模型 ID 自动识别，也可手动强制开启或关闭 */
  thinkingSupport?: ThinkingSupportMode;
  /** 当前为该模型选择的思考等级 */
  thinkingEffort?: ThinkingEffort;
}

export interface AiGeneralSettings {
  defaultModelConfigId: string;
}

/** 会话文件夹（可位于固定会话区或普通会话区） */
export interface AiFolder {
  id: string;
  name: string;
  pinned: boolean;
  collapsed: boolean;
  createdAt: number;
}

/** 会话在侧栏中的归属与排序元信息（固定状态、所属文件夹与自定义顺序） */
export interface AiConversationMeta {
  pinned?: boolean;
  folderId?: string;
  order?: number;
}

export interface AiConfig {
  version: 2;
  models: ConfiguredModel[];
  /** 在 AI 对话中启用的 MCP 服务 ID（对应 MCP 工具查看器中的连接 ID） */
  enabledMcpIds: string[];
  folders: AiFolder[];
  conversationMeta: Record<string, AiConversationMeta>;
  settings: AiGeneralSettings;
}

export interface ChatToolCall {
  id: string;
  serverId: string;
  serverName: string;
  toolName: string;
  argumentsText: string;
  resultText?: string;
  status: "running" | "done" | "error";
  /** 写/改文件类工具成功完成后记录的最新文件快照，供右侧「输出内容」展示 */
  outputFile?: {
    path: string;
    content: string;
  };
}

export type ToolApprovalDecision = "once" | "session" | "deny";

/** 会话的命令与外部写入执行策略：review 逐次确认（默认），auto 全部自动通过 */
export type ExecutionPolicy = "review" | "auto";

export interface PendingToolApproval {
  id: string;
  conversationId: string;
  toolName: string;
  kind: "command" | "externalWrite" | "tool";
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
  kind: "image" | "text";
  /** 图片类附件的 base64 Data URL */
  dataUrl?: string;
  /** 文本/代码类附件读取出的正文内容 */
  textContent?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  reasoning?: string;
  toolCalls?: ChatToolCall[];
  /** 按发生顺序记录的分段内容；旧消息缺省时界面自动回退渲染 */
  parts?: ChatMessagePart[];
  createdAt: number;
  modelConfigId?: string;
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
  createdAt: number;
  updatedAt: number;
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

/** 与「MCP 工具查看器」共用后端持久化的连接结构 */
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

export interface McpRemoteTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}
