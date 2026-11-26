import { t } from "@/locales";
import type { ApiProtocol, ChatAttachment, ThinkingEffort } from "./types";

export interface EndpointConfig {
  protocol: ApiProtocol;
  baseUrl: string;
  apiKey: string;
  requiresKey?: boolean;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
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

export interface ChatRequestOptions {
  endpoint: EndpointConfig;
  modelId: string;
  messages: PromptTurn[];
  systemPrompt?: string;
  maxTokens?: number | null;
  thinkingEffort?: ThinkingEffort;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
  onDelta?: (delta: { content?: string; reasoning?: string }) => void;
  fetchImpl?: typeof fetch;
}

export interface ChatResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCallRequest[];
}

export interface RemoteModelInfo {
  id: string;
  name?: string;
}

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function resolveFetch(custom?: typeof fetch): Promise<typeof fetch> {
  if (custom) return custom;
  if (hasTauriRuntime()) {
    const mod = await import("@tauri-apps/plugin-http");
    return mod.fetch as unknown as typeof fetch;
  }
  return globalThis.fetch.bind(globalThis);
}

export function stripTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** 从出错的 API 响应里尽量提取易读的错误原因 */
export async function extractHttpError(res: Response): Promise<string> {
  const statusLabel = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  let text = "";
  try {
    text = (await res.text()).trim();
  } catch {
    return statusLabel;
  }
  if (!text) return statusLabel;
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const errObj = json.error;
    if (typeof errObj === "string" && errObj.trim()) return `${statusLabel}: ${errObj.trim()}`;
    if (errObj && typeof errObj === "object") {
      const msg = (errObj as Record<string, unknown>).message;
      if (typeof msg === "string" && msg.trim()) return `${statusLabel}: ${msg.trim()}`;
    }
    if (typeof json.message === "string" && json.message.trim()) return `${statusLabel}: ${json.message.trim()}`;
    if (typeof json.detail === "string" && json.detail.trim()) return `${statusLabel}: ${json.detail.trim()}`;
  } catch {
    // 非 JSON 响应体
  }
  return `${statusLabel}: ${text.slice(0, 240)}`;
}

/**
 * 将部分模型写在正文中 `<think>...</think>` 标签拆分为思考过程和正文，兼容跨 chunk 边界。
 */
export function createThinkTagSplitter() {
  const OPEN = "<think>";
  const CLOSE = "</think>";
  let inside = false;
  let pending = "";

  const tailOverlap = (str: string, tag: string): number => {
    const max = Math.min(str.length, tag.length - 1);
    for (let len = max; len > 0; len--) {
      if (str.endsWith(tag.slice(0, len))) return len;
    }
    return 0;
  };

  return {
    push(chunk: string): { content: string; reasoning: string } {
      let content = "";
      let reasoning = "";
      let buffer = pending + chunk;
      pending = "";

      while (buffer.length > 0) {
        if (!inside) {
          const idx = buffer.indexOf(OPEN);
          if (idx >= 0) {
            content += buffer.slice(0, idx);
            buffer = buffer.slice(idx + OPEN.length);
            inside = true;
          } else {
            const keep = tailOverlap(buffer, OPEN);
            content += buffer.slice(0, buffer.length - keep);
            pending = buffer.slice(buffer.length - keep);
            buffer = "";
          }
        } else {
          const idx = buffer.indexOf(CLOSE);
          if (idx >= 0) {
            reasoning += buffer.slice(0, idx);
            buffer = buffer.slice(idx + CLOSE.length);
            inside = false;
          } else {
            const keep = tailOverlap(buffer, CLOSE);
            reasoning += buffer.slice(0, buffer.length - keep);
            pending = buffer.slice(buffer.length - keep);
            buffer = "";
          }
        }
      }
      return { content, reasoning };
    },
    flush(): { content: string; reasoning: string } {
      if (!pending) return { content: "", reasoning: "" };
      const rest = pending;
      pending = "";
      return inside ? { content: "", reasoning: rest } : { content: rest, reasoning: "" };
    },
  };
}

/** 通用 SSE 流读取器，逐事件回调 data 载荷 */
export async function readSseStream(
  res: Response,
  onEvent: (event: { event?: string; data: string }) => void,
): Promise<void> {
  if (!res.body) {
    const text = await res.text();
    for (const block of text.split(/\r?\n\r?\n/)) dispatchSseBlock(block, onEvent);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";
      for (const block of parts) dispatchSseBlock(block, onEvent);
    }
    buffer += decoder.decode();
    if (buffer.trim()) dispatchSseBlock(buffer, onEvent);
  } finally {
    reader.releaseLock();
  }
}

function dispatchSseBlock(
  block: string,
  onEvent: (event: { event?: string; data: string }) => void,
): void {
  let eventName: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }
  }
  if (dataLines.length > 0) {
    onEvent({ event: eventName, data: dataLines.join("\n") });
  }
}

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function buildTextWithFileAttachments(content: string, attachments?: ChatAttachment[]): string {
  const textFiles = (attachments ?? []).filter((a) => a.kind === "text" && a.textContent !== undefined);
  if (!textFiles.length) return content;
  const blocks = textFiles.map(
    (file) => `[File: ${file.name}]\n\`\`\`\n${file.textContent}\n\`\`\``,
  );
  return content.trim() ? `${blocks.join("\n\n")}\n\n${content}` : blocks.join("\n\n");
}

function validateEndpoint(endpoint: EndpointConfig): string {
  const base = stripTrailingSlash(endpoint.baseUrl);
  if (!base) throw new Error(t("ai.errors.missingBaseUrl"));
  if (endpoint.requiresKey && !endpoint.apiKey.trim()) {
    throw new Error(t("ai.errors.missingApiKey"));
  }
  return base;
}

function safeParseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 参数不合法时退回空对象
  }
  return {};
}

/** 清理 Gemini 不支持的 JSON Schema 字段（如 $schema、additionalProperties） */
function sanitizeGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$schema" || key === "additionalProperties" || key === "default") continue;
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const props: Record<string, unknown> = {};
      for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
        props[propKey] = propVal && typeof propVal === "object" && !Array.isArray(propVal)
          ? sanitizeGeminiSchema(propVal as Record<string, unknown>)
          : propVal;
      }
      out[key] = props;
    } else if (key === "items" && value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeGeminiSchema(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  if (!out.type) out.type = "object";
  return out;
}

export async function streamChat(options: ChatRequestOptions): Promise<ChatResult> {
  const base = validateEndpoint(options.endpoint);
  const fetchFn = await resolveFetch(options.fetchImpl);

  if (options.endpoint.protocol === "anthropic") {
    return runAnthropicChat(base, options, fetchFn);
  }
  if (options.endpoint.protocol === "gemini") {
    return runGeminiChat(base, options, fetchFn);
  }
  return runOpenAiChat(base, options, fetchFn);
}

async function runOpenAiChat(
  base: string,
  options: ChatRequestOptions,
  fetchFn: typeof fetch,
): Promise<ChatResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = options.endpoint.apiKey.trim();
  if (key) headers.Authorization = `Bearer ${key}`;

  const payloadMessages: Record<string, unknown>[] = [];
  if (options.systemPrompt?.trim()) {
    payloadMessages.push({ role: "system", content: options.systemPrompt.trim() });
  }
  for (const msg of options.messages) {
    if (msg.role === "tool") {
      payloadMessages.push({
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: msg.content,
      });
    } else if (msg.role === "assistant" && msg.toolCalls?.length) {
      payloadMessages.push({
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.argumentsText || "{}" },
        })),
      });
    } else if (msg.role === "user") {
      const mergedText = buildTextWithFileAttachments(msg.content, msg.attachments);
      const images = (msg.attachments ?? []).filter((a) => a.kind === "image" && a.dataUrl);
      if (images.length) {
        const parts: Record<string, unknown>[] = [];
        if (mergedText) parts.push({ type: "text", text: mergedText });
        for (const img of images) {
          parts.push({ type: "image_url", image_url: { url: img.dataUrl } });
        }
        payloadMessages.push({ role: "user", content: parts });
      } else {
        payloadMessages.push({ role: "user", content: mergedText });
      }
    } else {
      payloadMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const body: Record<string, unknown> = {
    model: options.modelId,
    messages: payloadMessages,
    stream: true,
  };
  if (typeof options.maxTokens === "number" && options.maxTokens > 0) body.max_tokens = options.maxTokens;
  if (options.thinkingEffort && options.thinkingEffort !== "none") {
    body.reasoning_effort = options.thinkingEffort;
  }
  if (options.tools?.length) {
    body.tools = options.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.parameters ?? { type: "object", properties: {} },
      },
    }));
  }

  const res = await fetchFn(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!res.ok) throw new Error(await extractHttpError(res));

  let content = "";
  let reasoning = "";
  const toolCallMap = new Map<number, ToolCallRequest>();
  const splitter = createThinkTagSplitter();

  const emitContent = (rawText: string) => {
    const split = splitter.push(rawText);
    if (split.reasoning) {
      reasoning += split.reasoning;
      options.onDelta?.({ reasoning: split.reasoning });
    }
    if (split.content) {
      content += split.content;
      options.onDelta?.({ content: split.content });
    }
  };

  await readSseStream(res, ({ data }) => {
    const trimmed = data.trim();
    if (!trimmed || trimmed === "[DONE]") return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }
    if (parsed.error && typeof parsed.error === "object") {
      const msg = (parsed.error as Record<string, unknown>).message;
      if (typeof msg === "string" && msg) throw new Error(msg);
    }
    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    const first = (choices[0] ?? {}) as Record<string, unknown>;
    const delta = (first.delta ?? first.message ?? {}) as Record<string, unknown>;
    const rChunk = typeof delta.reasoning_content === "string"
      ? delta.reasoning_content
      : typeof delta.reasoning === "string"
        ? delta.reasoning
        : "";
    if (rChunk) {
      reasoning += rChunk;
      options.onDelta?.({ reasoning: rChunk });
    }
    if (typeof delta.content === "string" && delta.content) {
      emitContent(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const rawCall of delta.tool_calls) {
        if (!rawCall || typeof rawCall !== "object") continue;
        const c = rawCall as Record<string, unknown>;
        const index = typeof c.index === "number" ? c.index : toolCallMap.size;
        const existing = toolCallMap.get(index) ?? {
          id: `call_${index + 1}`,
          name: "",
          argumentsText: "",
        };
        if (typeof c.id === "string" && c.id) existing.id = c.id;
        const fn = (c.function ?? {}) as Record<string, unknown>;
        if (typeof fn.name === "string" && fn.name) existing.name += fn.name;
        if (typeof fn.arguments === "string") existing.argumentsText += fn.arguments;
        toolCallMap.set(index, existing);
      }
    }
  });

  const tail = splitter.flush();
  if (tail.reasoning) {
    reasoning += tail.reasoning;
    options.onDelta?.({ reasoning: tail.reasoning });
  }
  if (tail.content) {
    content += tail.content;
    options.onDelta?.({ content: tail.content });
  }
  const toolCalls = [...toolCallMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => call)
    .filter((call) => call.name);
  return { content, reasoning, toolCalls };
}

async function runAnthropicChat(
  base: string,
  options: ChatRequestOptions,
  fetchFn: typeof fetch,
): Promise<ChatResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  const key = options.endpoint.apiKey.trim();
  if (key) headers["x-api-key"] = key;

  const anthropicMessages: Record<string, unknown>[] = [];
  for (const msg of options.messages) {
    if (msg.role === "tool") {
      const toolResultBlock = {
        type: "tool_result",
        tool_use_id: msg.toolCallId,
        content: msg.content,
      };
      const prev = anthropicMessages[anthropicMessages.length - 1];
      if (prev && prev.role === "user" && Array.isArray(prev.content)) {
        (prev.content as unknown[]).push(toolResultBlock);
      } else {
        anthropicMessages.push({ role: "user", content: [toolResultBlock] });
      }
    } else if (msg.role === "assistant" && msg.toolCalls?.length) {
      const blocks: Record<string, unknown>[] = [];
      if (msg.content) blocks.push({ type: "text", text: msg.content });
      for (const call of msg.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: safeParseJsonObject(call.argumentsText),
        });
      }
      anthropicMessages.push({ role: "assistant", content: blocks });
    } else if (msg.role === "user") {
      const mergedText = buildTextWithFileAttachments(msg.content, msg.attachments);
      const images = (msg.attachments ?? []).filter((a) => a.kind === "image" && a.dataUrl);
      if (images.length) {
        const blocks: Record<string, unknown>[] = [];
        for (const img of images) {
          const parsed = splitDataUrl(img.dataUrl!);
          if (parsed) {
            blocks.push({
              type: "image",
              source: { type: "base64", media_type: parsed.mimeType, data: parsed.base64 },
            });
          }
        }
        if (mergedText) blocks.push({ type: "text", text: mergedText });
        anthropicMessages.push({ role: "user", content: blocks });
      } else {
        anthropicMessages.push({ role: "user", content: mergedText });
      }
    } else {
      anthropicMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const anthropicThinkingBudget: Record<Exclude<ThinkingEffort, "none">, number> = {
    low: 2048,
    medium: 8192,
    high: 16384,
  };
  const enableThinking = Boolean(options.thinkingEffort && options.thinkingEffort !== "none");
  const thinkingBudget = enableThinking
    ? anthropicThinkingBudget[options.thinkingEffort as Exclude<ThinkingEffort, "none">]
    : 0;
  const baseMaxTokens = options.maxTokens && options.maxTokens > 0 ? options.maxTokens : 4096;
  const body: Record<string, unknown> = {
    model: options.modelId,
    max_tokens: enableThinking ? Math.max(baseMaxTokens, thinkingBudget + 2048) : baseMaxTokens,
    messages: anthropicMessages,
    stream: true,
  };
  if (options.systemPrompt?.trim()) body.system = options.systemPrompt.trim();
  if (enableThinking) {
    body.thinking = { type: "enabled", budget_tokens: thinkingBudget };
  }
  if (options.tools?.length) {
    body.tools = options.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      input_schema: tool.parameters ?? { type: "object", properties: {} },
    }));
  }

  const res = await fetchFn(`${base}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!res.ok) throw new Error(await extractHttpError(res));

  let content = "";
  let reasoning = "";
  const toolCallMap = new Map<number, ToolCallRequest>();

  await readSseStream(res, ({ data }) => {
    const trimmed = data.trim();
    if (!trimmed) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }
    if (parsed.type === "error" && parsed.error && typeof parsed.error === "object") {
      const msg = (parsed.error as Record<string, unknown>).message;
      throw new Error(typeof msg === "string" && msg ? msg : t("ai.errors.streamFailed"));
    }
    if (parsed.type === "content_block_start" && parsed.content_block && typeof parsed.content_block === "object") {
      const block = parsed.content_block as Record<string, unknown>;
      if (block.type === "tool_use" && typeof block.name === "string") {
        const index = typeof parsed.index === "number" ? parsed.index : toolCallMap.size;
        toolCallMap.set(index, {
          id: typeof block.id === "string" && block.id ? block.id : `toolu_${index + 1}`,
          name: block.name,
          argumentsText: "",
        });
      }
    }
    if (parsed.type === "content_block_delta" && parsed.delta && typeof parsed.delta === "object") {
      const delta = parsed.delta as Record<string, unknown>;
      if (delta.type === "text_delta" && typeof delta.text === "string" && delta.text) {
        content += delta.text;
        options.onDelta?.({ content: delta.text });
      } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string" && delta.thinking) {
        reasoning += delta.thinking;
        options.onDelta?.({ reasoning: delta.thinking });
      } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const index = typeof parsed.index === "number" ? parsed.index : -1;
        const call = toolCallMap.get(index);
        if (call) call.argumentsText += delta.partial_json;
      }
    }
  });

  const toolCalls = [...toolCallMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => call)
    .filter((call) => call.name);
  return { content, reasoning, toolCalls };
}

async function runGeminiChat(
  base: string,
  options: ChatRequestOptions,
  fetchFn: typeof fetch,
): Promise<ChatResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = options.endpoint.apiKey.trim();
  if (key) headers["x-goog-api-key"] = key;

  const generationConfig: Record<string, unknown> = {};
  if (typeof options.maxTokens === "number" && options.maxTokens > 0) {
    generationConfig.maxOutputTokens = options.maxTokens;
  }
  if (options.thinkingEffort && options.thinkingEffort !== "none") {
    const geminiBudget: Record<Exclude<ThinkingEffort, "none">, number> = {
      low: 1024,
      medium: 4096,
      high: 12288,
    };
    generationConfig.thinkingConfig = {
      thinkingBudget: geminiBudget[options.thinkingEffort],
      includeThoughts: true,
    };
  }

  const contents: Record<string, unknown>[] = [];
  for (const msg of options.messages) {
    if (msg.role === "tool") {
      const part = {
        functionResponse: {
          name: msg.toolName,
          response: { result: msg.content },
        },
      };
      const prev = contents[contents.length - 1];
      if (prev && prev.role === "user" && Array.isArray(prev.parts)) {
        (prev.parts as unknown[]).push(part);
      } else {
        contents.push({ role: "user", parts: [part] });
      }
    } else if (msg.role === "assistant" && msg.toolCalls?.length) {
      const parts: Record<string, unknown>[] = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const call of msg.toolCalls) {
        parts.push({
          functionCall: {
            name: call.name,
            args: safeParseJsonObject(call.argumentsText),
          },
        });
      }
      contents.push({ role: "model", parts });
    } else if (msg.role === "user") {
      const mergedText = buildTextWithFileAttachments(msg.content, msg.attachments);
      const parts: Record<string, unknown>[] = [];
      for (const img of (msg.attachments ?? []).filter((a) => a.kind === "image" && a.dataUrl)) {
        const parsed = splitDataUrl(img.dataUrl!);
        if (parsed) {
          parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } });
        }
      }
      if (mergedText || !parts.length) parts.push({ text: mergedText });
      contents.push({ role: "user", parts });
    } else {
      contents.push({
        role: "model",
        parts: [{ text: msg.content }],
      });
    }
  }

  const body: Record<string, unknown> = {
    contents,
  };
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }
  if (options.systemPrompt?.trim()) {
    body.systemInstruction = { parts: [{ text: options.systemPrompt.trim() }] };
  }
  if (options.tools?.length) {
    body.tools = [
      {
        functionDeclarations: options.tools.map((tool) => ({
          name: tool.name,
          description: tool.description || "",
          parameters: sanitizeGeminiSchema(tool.parameters ?? { type: "object", properties: {} }),
        })),
      },
    ];
  }

  const modelPath = encodeURIComponent(options.modelId.replace(/^models\//, ""));
  const endpoint = `${base}/models/${modelPath}:streamGenerateContent?alt=sse`;

  const res = await fetchFn(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!res.ok) throw new Error(await extractHttpError(res));

  let content = "";
  let reasoning = "";
  const toolCalls: ToolCallRequest[] = [];

  const handlePayload = (parsed: Record<string, unknown>) => {
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    const first = (candidates[0] ?? {}) as Record<string, unknown>;
    const msg = (first.content ?? {}) as Record<string, unknown>;
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string" && p.text) {
        if (p.thought === true) {
          reasoning += p.text;
          options.onDelta?.({ reasoning: p.text });
        } else {
          content += p.text;
          options.onDelta?.({ content: p.text });
        }
      }
      if (p.functionCall && typeof p.functionCall === "object") {
        const fc = p.functionCall as Record<string, unknown>;
        if (typeof fc.name === "string" && fc.name) {
          toolCalls.push({
            id: `gemini_call_${toolCalls.length + 1}`,
            name: fc.name,
            argumentsText: JSON.stringify(fc.args ?? {}),
          });
        }
      }
    }
  };

  await readSseStream(res, ({ data }) => {
    const trimmed = data.trim();
    if (!trimmed) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }
    if (parsed.error && typeof parsed.error === "object") {
      const msg = (parsed.error as Record<string, unknown>).message;
      if (typeof msg === "string" && msg) throw new Error(msg);
    }
    handlePayload(parsed);
  });

  return { content, reasoning, toolCalls };
}

/** 从提供商接口拉取可用模型列表 */
export async function fetchEndpointModels(
  endpoint: EndpointConfig,
  fetchImpl?: typeof fetch,
): Promise<RemoteModelInfo[]> {
  const base = validateEndpoint(endpoint);
  const fetchFn = await resolveFetch(fetchImpl);
  const key = endpoint.apiKey.trim();

  if (endpoint.protocol === "anthropic") {
    const headers: Record<string, string> = { "anthropic-version": "2023-06-01" };
    if (key) headers["x-api-key"] = key;
    const res = await fetchFn(`${base}/models`, { method: "GET", headers });
    if (!res.ok) throw new Error(await extractHttpError(res));
    const json = (await res.json()) as Record<string, unknown>;
    const list = Array.isArray(json.data) ? json.data : [];
    return list
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        id: String(item.id ?? "").trim(),
        name: typeof item.display_name === "string" && item.display_name.trim() ? item.display_name.trim() : undefined,
      }))
      .filter((m) => m.id);
  }

  if (endpoint.protocol === "gemini") {
    const headers: Record<string, string> = {};
    if (key) headers["x-goog-api-key"] = key;
    const res = await fetchFn(`${base}/models`, { method: "GET", headers });
    if (!res.ok) throw new Error(await extractHttpError(res));
    const json = (await res.json()) as Record<string, unknown>;
    const list = Array.isArray(json.models) ? json.models : [];
    return list
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .filter((item) => {
        const methods = Array.isArray(item.supportedGenerationMethods) ? item.supportedGenerationMethods : [];
        return methods.length === 0 || methods.includes("generateContent");
      })
      .map((item) => ({
        id: String(item.name ?? "").replace(/^models\//, "").trim(),
        name: typeof item.displayName === "string" && item.displayName.trim() ? item.displayName.trim() : undefined,
      }))
      .filter((m) => m.id);
  }

  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetchFn(`${base}/models`, { method: "GET", headers });
  if (!res.ok) throw new Error(await extractHttpError(res));
  const json = (await res.json()) as Record<string, unknown>;
  const list = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      id: String(item.id ?? item.name ?? "").trim(),
      name: typeof item.name === "string" && item.name.trim() && item.name !== item.id ? item.name.trim() : undefined,
    }))
    .filter((m) => m.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}
