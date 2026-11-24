import { translationIn, type Locale, type Translations } from "@/locales/types";
import type {
  AiConfig,
  AiConversationMeta,
  AiFolder,
  AiGeneralSettings,
  AiPromptPreset,
  ApiProtocol,
  ConfiguredModel,
  ThinkingEffort,
  ThinkingSupportMode,
} from "./types";

export interface ProviderPreset {
  id: string;
  name: string;
  protocol: ApiProtocol;
  baseUrl: string;
  requiresKey: boolean;
  sampleModels: string[];
}

/** 内置常用提供商预设，供新增模型时一键带出默认地址与协议 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    requiresKey: true,
    sampleModels: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "o3-mini"],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    requiresKey: true,
    sampleModels: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-haiku-20241022"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresKey: true,
    sampleModels: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    requiresKey: true,
    sampleModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "qwen",
    name: "通义千问 (Qwen)",
    protocol: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    requiresKey: true,
    sampleModels: ["qwen-max", "qwen-plus", "qwen-turbo", "qwq-plus"],
  },
  {
    id: "zhipu",
    name: "智谱清言 (GLM)",
    protocol: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    requiresKey: true,
    sampleModels: ["glm-4-plus", "glm-4-air", "glm-4-flash", "glm-z1-air"],
  },
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    protocol: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    requiresKey: true,
    sampleModels: ["kimi-latest", "moonshot-v1-8k", "moonshot-v1-32k"],
  },
  {
    id: "siliconflow",
    name: "硅基流动 (SiliconFlow)",
    protocol: "openai",
    baseUrl: "https://api.siliconflow.cn/v1",
    requiresKey: true,
    sampleModels: ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    sampleModels: ["openai/gpt-4o", "anthropic/claude-sonnet-4", "google/gemini-2.5-flash"],
  },
  {
    id: "ollama",
    name: "Ollama (本地)",
    protocol: "openai",
    baseUrl: "http://localhost:11434/v1",
    requiresKey: false,
    sampleModels: ["qwen2.5:7b", "deepseek-r1:8b", "llama3.2"],
  },
  {
    id: "custom",
    name: "自定义接口",
    protocol: "openai",
    baseUrl: "",
    requiresKey: false,
    sampleModels: [],
  },
];

export const PROVIDER_NAMES: Translations<Record<string, string>> = {
  en: {
    qwen: "Qwen (DashScope)",
    zhipu: "Zhipu GLM",
    siliconflow: "SiliconFlow",
    ollama: "Ollama (Local)",
    custom: "Custom Endpoint",
  },
  ja: {
    qwen: "Qwen (DashScope)",
    zhipu: "Zhipu GLM",
    siliconflow: "SiliconFlow",
    ollama: "Ollama (ローカル)",
    custom: "カスタムエンドポイント",
  },
};

export function findProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

export function providerDisplayName(providerId: string, l: Locale): string {
  const preset = findProviderPreset(providerId);
  if (!preset) return providerId || (translationIn(PROVIDER_NAMES, l, "custom") ?? "自定义接口");
  return translationIn(PROVIDER_NAMES, l, preset.id) ?? preset.name;
}

export function providerRequiresKey(providerId: string): boolean {
  const preset = findProviderPreset(providerId);
  return preset ? preset.requiresKey : false;
}

export function makeEntityId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULT_GENERAL_SETTINGS: AiGeneralSettings = {
  defaultModelConfigId: "",
  defaultPromptId: "",
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: null,
  contextMessages: 20,
  stream: true,
  sendKey: "enter",
};

export function createDefaultConfig(): AiConfig {
  return {
    version: 2,
    models: [],
    prompts: [],
    enabledMcpIds: [],
    folders: [],
    conversationMeta: {},
    settings: { ...DEFAULT_GENERAL_SETTINGS },
  };
}

function validProtocol(value: unknown): ApiProtocol {
  return value === "anthropic" || value === "gemini" ? value : "openai";
}

function validThinkingSupport(value: unknown): ThinkingSupportMode | undefined {
  return value === "auto" || value === "enabled" || value === "disabled" ? value : undefined;
}

function validThinkingEffort(value: unknown): ThinkingEffort | undefined {
  return value === "none" || value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function isAlwaysReasoningModel(id: string): boolean {
  return (
    /(^|\/)(o1|o3|o4|gpt-5)([-.\w]*|$)/.test(id) ||
    /gemini-(2\.5|3|4)/.test(id) && !/flash|lite/.test(id) ||
    /(reasoner|deepseek-r1|qwq|glm-z1|thinking|reasoning)/.test(id)
  );
}

function isHybridReasoningModel(id: string): boolean {
  return (
    (/gemini-(2\.5|3|4)/.test(id) && /flash|lite/.test(id)) ||
    /claude-(3[.-]7|sonnet-4|opus-4|haiku-4|[45])/.test(id) ||
    /(qwen3|glm-4\.5)/.test(id)
  );
}

/** 返回模型支持的思考等级列表：除显式关闭外，所有模型均支持悬停选择思考等级 */
export function supportedThinkingEffortsOf(
  model: Pick<ConfiguredModel, "modelId" | "protocol" | "thinkingSupport">,
): ThinkingEffort[] {
  if (model.thinkingSupport === "disabled") return [];
  if (model.thinkingSupport === "enabled") return ["none", "low", "medium", "high"];

  const id = model.modelId.trim().toLowerCase();
  if (isAlwaysReasoningModel(id)) {
    return ["low", "medium", "high"];
  }
  return ["none", "low", "medium", "high"];
}

/** 解析该模型当前实际生效的思考等级（推理模型默认 medium，普通模型默认 none） */
export function resolveThinkingEffort(
  model: Pick<ConfiguredModel, "modelId" | "protocol" | "thinkingSupport" | "thinkingEffort">,
): ThinkingEffort | undefined {
  const supported = supportedThinkingEffortsOf(model);
  if (!supported.length) return undefined;
  if (model.thinkingEffort && supported.includes(model.thinkingEffort)) return model.thinkingEffort;
  const id = model.modelId.trim().toLowerCase();
  if (isAlwaysReasoningModel(id) || isHybridReasoningModel(id)) {
    return supported.includes("medium") ? "medium" : supported[0];
  }
  return supported.includes("none") ? "none" : supported[0];
}

/** 兼容旧版按提供商分组的配置（version: 1）平滑迁移到新版扁平模型配置（version: 2） */
function migrateV1Providers(rawProviders: unknown[]): ConfiguredModel[] {
  const out: ConfiguredModel[] = [];
  for (const item of rawProviders) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const enabled = Boolean(p.enabled);
    const apiKey = typeof p.apiKey === "string" ? p.apiKey : "";
    const providerId = typeof p.id === "string" ? p.id : "custom";
    const preset = findProviderPreset(providerId);
    const requiresKey = preset ? preset.requiresKey : true;
    // 只把用户实际配置过或启用过的提供商模型迁移出来，避免空配置刷屏
    if (!enabled && !apiKey.trim()) continue;
    if (requiresKey && !apiKey.trim()) continue;
    const baseUrl = typeof p.baseUrl === "string" && p.baseUrl.trim()
      ? p.baseUrl.trim()
      : (preset?.baseUrl ?? "");
    const protocol = validProtocol(p.protocol ?? preset?.protocol);
    const rawModels = Array.isArray(p.models) ? p.models : [];
    for (const m of rawModels) {
      if (!m || typeof m !== "object") continue;
      const modelRec = m as Record<string, unknown>;
      const modelId = typeof modelRec.id === "string" ? modelRec.id.trim() : "";
      if (!modelId || modelRec.enabled === false) continue;
      out.push({
        id: `${providerId}__${modelId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48),
        providerId: preset ? preset.id : "custom",
        name: typeof modelRec.name === "string" && modelRec.name.trim() ? modelRec.name.trim() : "",
        protocol,
        baseUrl,
        apiKey,
        modelId,
        enabled: true,
      });
    }
  }
  return out;
}

export function normalizeConfig(raw: unknown): AiConfig {
  const defaults = createDefaultConfig();
  if (!raw || typeof raw !== "object") return defaults;
  const record = raw as Record<string, unknown>;

  let models: ConfiguredModel[] = [];
  if (Array.isArray(record.models)) {
    const seen = new Set<string>();
    for (const item of record.models) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;
      const modelId = typeof m.modelId === "string" ? m.modelId.trim() : "";
      if (!modelId) continue;
      const id = typeof m.id === "string" && m.id.trim() ? m.id.trim() : makeEntityId("mdl");
      if (seen.has(id)) continue;
      seen.add(id);
      const providerId = typeof m.providerId === "string" && m.providerId.trim() ? m.providerId.trim() : "custom";
      const preset = findProviderPreset(providerId);
      models.push({
        id,
        providerId: preset ? preset.id : "custom",
        name: typeof m.name === "string" ? m.name.trim() : "",
        protocol: validProtocol(m.protocol ?? preset?.protocol),
        baseUrl: typeof m.baseUrl === "string" && m.baseUrl.trim() ? m.baseUrl.trim() : (preset?.baseUrl ?? ""),
        apiKey: typeof m.apiKey === "string" ? m.apiKey : "",
        modelId,
        enabled: m.enabled !== false,
        thinkingSupport: validThinkingSupport(m.thinkingSupport),
        thinkingEffort: validThinkingEffort(m.thinkingEffort),
      });
    }
  } else if (Array.isArray(record.providers)) {
    models = migrateV1Providers(record.providers);
  }

  const prompts: AiPromptPreset[] = [];
  if (Array.isArray(record.prompts)) {
    const seen = new Set<string>();
    for (const item of record.prompts) {
      if (!item || typeof item !== "object") continue;
      const p = item as Record<string, unknown>;
      const name = typeof p.name === "string" ? p.name.trim() : "";
      const content = typeof p.content === "string" ? p.content : "";
      if (!name && !content.trim()) continue;
      const id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : makeEntityId("prm");
      if (seen.has(id)) continue;
      seen.add(id);
      prompts.push({
        id,
        name: name || id,
        content,
        updatedAt: typeof p.updatedAt === "number" && Number.isFinite(p.updatedAt) ? p.updatedAt : Date.now(),
      });
    }
  }

  const enabledMcpIds: string[] = Array.isArray(record.enabledMcpIds)
    ? [...new Set(record.enabledMcpIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0))]
    : [];

  const folders: AiFolder[] = [];
  const folderIds = new Set<string>();
  if (Array.isArray(record.folders)) {
    for (const item of record.folders) {
      if (!item || typeof item !== "object") continue;
      const f = item as Record<string, unknown>;
      const id = typeof f.id === "string" && f.id.trim() ? f.id.trim() : makeEntityId("fld");
      if (folderIds.has(id)) continue;
      const name = typeof f.name === "string" ? f.name.trim() : "";
      folderIds.add(id);
      folders.push({
        id,
        name: name || id,
        pinned: Boolean(f.pinned),
        collapsed: Boolean(f.collapsed),
        createdAt: typeof f.createdAt === "number" && Number.isFinite(f.createdAt) ? f.createdAt : Date.now(),
      });
    }
  }

  const conversationMeta: Record<string, AiConversationMeta> = {};
  if (record.conversationMeta && typeof record.conversationMeta === "object" && !Array.isArray(record.conversationMeta)) {
    for (const [convId, rawMeta] of Object.entries(record.conversationMeta as Record<string, unknown>)) {
      if (!convId || !rawMeta || typeof rawMeta !== "object") continue;
      const m = rawMeta as Record<string, unknown>;
      const folderId = typeof m.folderId === "string" && folderIds.has(m.folderId) ? m.folderId : undefined;
      const pinned = Boolean(m.pinned);
      if (pinned || folderId) {
        conversationMeta[convId] = {
          ...(pinned ? { pinned: true } : {}),
          ...(folderId ? { folderId } : {}),
        };
      }
    }
  }

  const rawSettings = (record.settings && typeof record.settings === "object" ? record.settings : {}) as Record<string, unknown>;
  const temp = typeof rawSettings.temperature === "number" && Number.isFinite(rawSettings.temperature)
    ? Math.min(2, Math.max(0, rawSettings.temperature))
    : DEFAULT_GENERAL_SETTINGS.temperature;
  const maxTokens = typeof rawSettings.maxTokens === "number" && Number.isFinite(rawSettings.maxTokens) && rawSettings.maxTokens > 0
    ? Math.round(rawSettings.maxTokens)
    : null;
  const contextMessages = typeof rawSettings.contextMessages === "number" && Number.isFinite(rawSettings.contextMessages)
    ? Math.min(100, Math.max(0, Math.round(rawSettings.contextMessages)))
    : DEFAULT_GENERAL_SETTINGS.contextMessages;

  let defaultModelConfigId = typeof rawSettings.defaultModelConfigId === "string" ? rawSettings.defaultModelConfigId : "";
  if (!defaultModelConfigId && typeof rawSettings.defaultProviderId === "string" && typeof rawSettings.defaultModelId === "string") {
    const matched = models.find(
      (m) => m.providerId === rawSettings.defaultProviderId && m.modelId === rawSettings.defaultModelId,
    );
    if (matched) defaultModelConfigId = matched.id;
  }

  const settings: AiGeneralSettings = {
    defaultModelConfigId,
    defaultPromptId: typeof rawSettings.defaultPromptId === "string" ? rawSettings.defaultPromptId : "",
    systemPrompt: typeof rawSettings.systemPrompt === "string" ? rawSettings.systemPrompt : "",
    temperature: temp,
    maxTokens,
    contextMessages,
    stream: rawSettings.stream !== false,
    sendKey: rawSettings.sendKey === "ctrlEnter" ? "ctrlEnter" : "enter",
  };

  return { version: 2, models, prompts, enabledMcpIds, folders, conversationMeta, settings };
}

/** 判断模型配置是否可用 */
export function isModelReady(model: ConfiguredModel): boolean {
  if (!model.enabled) return false;
  if (!model.baseUrl.trim() || !model.modelId.trim()) return false;
  if (providerRequiresKey(model.providerId) && !model.apiKey.trim()) return false;
  return true;
}
