import { describe, expect, test } from "vitest";
import { createI18n, type I18nOptions } from "vue-i18n";
import type { Ref } from "vue";
import { createThinkTagSplitter, fetchEndpointModels, streamChat } from "./client";
import aiLocales from "./locales";
import { inferCodeFileName } from "./markdown";
import { buildSafeFunctionName, formatMcpToolResult } from "./mcp";
import { isModelReady, normalizeConfig, resolveThinkingEffort, supportedThinkingEffortsOf } from "./presets";

function makeSseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("AI 配置与兼容迁移", () => {
  test("保留多模型、提示词与已启用 MCP，并裁剪非法参数范围", () => {
    const restored = normalizeConfig({
      version: 2,
      models: [
        {
          id: "m1",
          providerId: "openai",
          name: "主模型",
          protocol: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-123",
          modelId: "gpt-4.1",
          enabled: true,
        },
        {
          id: "m2",
          providerId: "ollama",
          name: "",
          protocol: "openai",
          baseUrl: "http://localhost:11434/v1",
          apiKey: "",
          modelId: "qwen2.5:7b",
          enabled: true,
        },
      ],
      prompts: [{ id: "p1", name: "代码审查", content: "严格检查边界条件", updatedAt: 100 }],
      enabledMcpIds: ["mcp-1", "mcp-1"],
      settings: {
        defaultModelConfigId: "m1",
        defaultPromptId: "p1",
        temperature: 9,
        contextMessages: -5,
        sendKey: "ctrlEnter",
      },
    });

    expect(restored.models).toHaveLength(2);
    expect(isModelReady(restored.models[0])).toBe(true);
    expect(isModelReady(restored.models[1])).toBe(true);
    expect(restored.prompts).toHaveLength(1);
    expect(restored.enabledMcpIds).toEqual(["mcp-1"]);
    expect(restored.settings.temperature).toBe(2);
    expect(restored.settings.contextMessages).toBe(0);
    expect(restored.settings.sendKey).toBe("ctrlEnter");
  });

  test("旧版 v1 按提供商分组的配置能平滑迁移到 v2 多模型列表", () => {
    const migrated = normalizeConfig({
      version: 1,
      providers: [
        {
          id: "deepseek",
          enabled: true,
          apiKey: "sk-ds-999",
          baseUrl: "https://api.deepseek.com/v1",
          models: [
            { id: "deepseek-chat", enabled: true },
            { id: "deepseek-reasoner", enabled: false },
          ],
        },
      ],
      settings: { defaultProviderId: "deepseek", defaultModelId: "deepseek-chat" },
    });

    expect(migrated.models).toHaveLength(1);
    expect(migrated.models[0].modelId).toBe("deepseek-chat");
    expect(migrated.models[0].apiKey).toBe("sk-ds-999");
    expect(migrated.settings.defaultModelConfigId).toBe(migrated.models[0].id);
  });

  test("按模型 ID 自动推断思考等级并支持手动覆写", () => {
    expect(supportedThinkingEffortsOf({ modelId: "o3-mini", protocol: "openai" })).toEqual(["low", "medium", "high"]);
    expect(supportedThinkingEffortsOf({ modelId: "gemini-2.5-flash", protocol: "gemini" })).toEqual(["none", "low", "medium", "high"]);
    expect(supportedThinkingEffortsOf({ modelId: "claude-sonnet-4-20250514", protocol: "anthropic" })).toEqual(["none", "low", "medium", "high"]);
    // 普通模型默认也允许在悬停菜单中切换思考等级，默认等级为 none（关闭）
    expect(supportedThinkingEffortsOf({ modelId: "gpt-4o", protocol: "openai" })).toEqual(["none", "low", "medium", "high"]);
    expect(resolveThinkingEffort({ modelId: "gpt-4o", protocol: "openai" })).toBe("none");
    expect(supportedThinkingEffortsOf({ modelId: "gpt-4o", protocol: "openai", thinkingSupport: "disabled" })).toEqual([]);
    expect(resolveThinkingEffort({ modelId: "o3-mini", protocol: "openai" })).toBe("medium");
    expect(resolveThinkingEffort({ modelId: "o3-mini", protocol: "openai", thinkingEffort: "high" })).toBe("high");
  });
});

describe("AI 协议、流式解析与 MCP 工具调用", () => {
  test("跨 chunk 正确拆分 <think> 标签内容", () => {
    const splitter = createThinkTagSplitter();
    const parts = ["<thi", "nk>先想", "一想</th", "ink>最终", "答案"];
    let content = "";
    let reasoning = "";
    for (const part of parts) {
      const res = splitter.push(part);
      content += res.content;
      reasoning += res.reasoning;
    }
    const tail = splitter.flush();
    content += tail.content;
    reasoning += tail.reasoning;

    expect(reasoning).toBe("先想一想");
    expect(content).toBe("最终答案");
  });

  test("解析 OpenAI 兼容 SSE 流式输出、思考过程与 tool_calls", async () => {
    const result = await streamChat({
      endpoint: {
        protocol: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        requiresKey: true,
      },
      modelId: "gpt-4.1",
      messages: [{ role: "user", content: "算一下 1+2" }],
      thinkingEffort: "high",
      tools: [{ name: "mcp_1_add", description: "Add", parameters: { type: "object", properties: {} } }],
      stream: true,
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
        const body = JSON.parse(String(init?.body));
        expect(body.reasoning_effort).toBe("high");
        expect(body.tools[0].function.name).toBe("mcp_1_add");
        return makeSseResponse([
          'data: {"choices":[{"delta":{"reasoning_content":"准备调用加法"}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"mcp_1_add","arguments":"{\\"a\\":1,"}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"b\\":2}"}}]}}]}\n\n',
          "data: [DONE]\n\n",
        ]);
      },
    });

    expect(result.reasoning).toBe("准备调用加法");
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "mcp_1_add", argumentsText: '{"a":1,"b":2}' }]);
  });

  test("解析 Anthropic Messages SSE 思考、文本与 tool_use", async () => {
    const result = await streamChat({
      endpoint: {
        protocol: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "sk-ant-test",
        requiresKey: true,
      },
      modelId: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
        const headers = init?.headers as Record<string, string>;
        expect(headers["x-api-key"]).toBe("sk-ant-test");
        return makeSseResponse([
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"step 1"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
          'event: content_block_start\ndata: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"mcp_1_search"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\\"q\\":\\"ai\\"}"}}\n\n',
        ]);
      },
    });

    expect(result).toEqual({
      reasoning: "step 1",
      content: "Hello",
      toolCalls: [{ id: "toolu_1", name: "mcp_1_search", argumentsText: '{"q":"ai"}' }],
    });
  });

  test("解析 Gemini SSE 思考、文本、functionCall 与模型列表", async () => {
    const endpoint = {
      protocol: "gemini" as const,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "gm-key",
      requiresKey: true,
    };

    const chatRes = await streamChat({
      endpoint,
      modelId: "gemini-2.5-flash",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
      fetchImpl: async () =>
        makeSseResponse([
          'data: {"candidates":[{"content":{"parts":[{"text":"推理","thought":true}]}}]}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"text":"回答内容"},{"functionCall":{"name":"mcp_1_now","args":{}}}]}}]}\n\n',
        ]),
    });
    expect(chatRes.reasoning).toBe("推理");
    expect(chatRes.content).toBe("回答内容");
    expect(chatRes.toolCalls).toEqual([{ id: "gemini_call_1", name: "mcp_1_now", argumentsText: "{}" }]);

    const models = await fetchEndpointModels(endpoint, async () =>
      new Response(
        JSON.stringify({
          models: [
            { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] },
            { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    expect(models).toEqual([{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }]);
  });

  test("MCP 工具名生成去重与结果格式化", () => {
    const used = new Set<string>();
    expect(buildSafeFunctionName(1, "fs.read/file", used)).toBe("mcp_1_fs_read_file");
    expect(buildSafeFunctionName(1, "fs.read/file", used)).toBe("mcp_1_fs_read_file_2");
    expect(formatMcpToolResult({ content: [{ type: "text", text: "ok" }] })).toBe("ok");
  });

  test("代码块下载按语言和正文内容智能推断文件名与后缀", () => {
    expect(inferCodeFileName("print('hi')", "python")).toBe("script.py");
    expect(inferCodeFileName("def hello(name: str):\n    return name", "text")).toBe("script.py");
    expect(inferCodeFileName("# app.py\nprint(1)", "python")).toBe("app.py");
    expect(inferCodeFileName('{"name":"open-tools"}', "text")).toBe("data.json");
    expect(inferCodeFileName("<!DOCTYPE html><html><body>Hi</body></html>", "")).toBe("index.html");
    expect(inferCodeFileName("SELECT * FROM users WHERE id = 1;", "text")).toBe("query.sql");
    expect(inferCodeFileName("public class UserService {}", "text")).toBe("UserService.java");
    expect(inferCodeFileName("Domain: EXAMPLE.COM\nRegistry ID: 12345", "text")).toBe("snippet.txt");
  });

  test("AI 三语文案均能通过 vue-i18n 正常编译且无缺失", () => {
    const messages = aiLocales.messages!;
    const i18n = createI18n({
      legacy: false,
      locale: "zh-CN",
      messages: messages as I18nOptions["messages"],
    });
    const global = i18n.global as unknown as {
      locale: Ref<string>;
      t: (key: string, named?: Record<string, unknown>) => string;
    };
    const collectKeys = (obj: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([k, v]) => {
        const path = prefix ? `${prefix}.${k}` : k;
        return typeof v === "string" ? [path] : collectKeys(v as Record<string, unknown>, path);
      });
    const keys = collectKeys(messages["zh-CN"]);
    for (const lang of ["zh-CN", "en", "ja"] as const) {
      global.locale.value = lang;
      for (const key of keys) {
        const rendered = global.t(key, { n: 2, sec: "1.2", value: "0.7", name: "demo.txt", limit: "2 MB" });
        expect(rendered).toBeTruthy();
        expect(rendered).not.toBe(key);
      }
    }
  });
});
