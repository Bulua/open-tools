import { translationIn, type Locale, type Translations } from "@/locales/types";
import type {
  AiConfig,
  ConfiguredModel,
  ProviderPreset,
  ThinkingEffort,
} from "@/types/ai";

export type { ProviderPreset };

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
    id: "volcengine",
    name: "火山方舟 (豆包)",
    protocol: "openai",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    requiresKey: true,
    sampleModels: ["doubao-1-5-pro-32k-250115", "doubao-1-5-thinking-pro-250415"],
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
    id: "minimax",
    name: "MiniMax",
    protocol: "openai",
    baseUrl: "https://api.minimax.chat/v1",
    requiresKey: true,
    sampleModels: ["MiniMax-Text-01", "abab6.5s-chat"],
  },
  {
    id: "hunyuan",
    name: "腾讯混元 (Hunyuan)",
    protocol: "openai",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    requiresKey: true,
    sampleModels: ["hunyuan-turbos-latest", "hunyuan-t1-latest"],
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
    id: "xai",
    name: "xAI (Grok)",
    protocol: "openai",
    baseUrl: "https://api.x.ai/v1",
    requiresKey: true,
    sampleModels: ["grok-3", "grok-3-mini"],
  },
  {
    id: "groq",
    name: "Groq",
    protocol: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    requiresKey: true,
    sampleModels: ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b"],
  },
  {
    id: "mistral",
    name: "Mistral",
    protocol: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    requiresKey: true,
    sampleModels: ["mistral-large-latest", "codestral-latest"],
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
    volcengine: "Volcengine Ark (Doubao)",
    hunyuan: "Tencent Hunyuan",
    siliconflow: "SiliconFlow",
    ollama: "Ollama (Local)",
    custom: "Custom Endpoint",
  },
  ja: {
    qwen: "Qwen (DashScope)",
    zhipu: "Zhipu GLM",
    volcengine: "Volcengine Ark (Doubao)",
    hunyuan: "Tencent Hunyuan",
    siliconflow: "SiliconFlow",
    ollama: "Ollama (ローカル)",
    custom: "カスタムエンドポイント",
  },
};

const BASE_URL_VENDOR_RULES: ReadonlyArray<[RegExp, string]> = [
  [/api\.deepseek\.com/i, "deepseek"],
  [/dashscope\.aliyuncs\.com/i, "qwen"],
  [/open\.bigmodel\.cn/i, "zhipu"],
  [/volces\.com/i, "volcengine"],
  [/moonshot\.(cn|ai)/i, "moonshot"],
  [/minimax(i)?\.(chat|io|com)/i, "minimax"],
  [/hunyuan\.cloud\.tencent\.com/i, "hunyuan"],
  [/siliconflow\.(cn|com)/i, "siliconflow"],
  [/openrouter\.ai/i, "openrouter"],
  [/api\.x\.ai/i, "xai"],
  [/api\.groq\.com/i, "groq"],
  [/api\.mistral\.ai/i, "mistral"],
  [/api\.anthropic\.com/i, "anthropic"],
  [/generativelanguage\.googleapis\.com/i, "gemini"],
  [/(localhost|127\.0\.0\.1):11434/i, "ollama"],
];

/** 按接口地址自动识别具体厂商，避免兼容接口笼统显示为 OpenAI 或自定义接口 */
export function inferProviderIdFromBaseUrl(baseUrl?: string): string | undefined {
  const url = baseUrl?.trim();
  if (!url) return undefined;
  for (const [pattern, id] of BASE_URL_VENDOR_RULES) {
    if (pattern.test(url)) return id;
  }
  return undefined;
}

export function findProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

export function providerDisplayName(providerId: string, l: Locale): string {
  const preset = findProviderPreset(providerId);
  if (!preset) return providerId || (translationIn(PROVIDER_NAMES, l, "custom") ?? "自定义接口");
  return translationIn(PROVIDER_NAMES, l, preset.id) ?? preset.name;
}

/** 解析单个模型最终展示的具体厂商名：优先自定义厂商名 -> 预设厂商名 -> 按 baseUrl 推断的具体厂商 */
export function resolveModelProviderName(
  model: Pick<ConfiguredModel, "providerId" | "providerName" | "baseUrl">,
  l: Locale,
): string {
  const custom = model.providerName?.trim();
  if (custom) return custom;
  if (model.providerId === "openai" || model.providerId === "custom") {
    const inferred = inferProviderIdFromBaseUrl(model.baseUrl);
    if (inferred) return providerDisplayName(inferred, l);
  }
  return providerDisplayName(model.providerId, l);
}

export function providerRequiresKey(providerId: string): boolean {
  const preset = findProviderPreset(providerId);
  return preset ? preset.requiresKey : false;
}

export function createDefaultConfig(): AiConfig {
  return {
    models: [],
    enabledMcpIds: [],
    disabledBuiltinTools: [],
    folders: [],
    conversationMeta: {},
  };
}

function isAlwaysReasoningModel(id: string): boolean {
  return (
    /(^|\/)(o1|o3|o4|gpt-5)([-.\w]*|$)/.test(id) ||
    (/gemini-(2\.5|3|4)/.test(id) && !/flash|lite/.test(id)) ||
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

/** 判断模型配置是否可用 */
export function isModelReady(model: ConfiguredModel): boolean {
  if (!model.enabled) return false;
  if (!model.baseUrl.trim() || !model.modelId.trim()) return false;
  if (providerRequiresKey(model.providerId) && !model.hasApiKey) return false;
  return true;
}
