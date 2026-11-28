import { mcpApi } from "@/api/mcp";
import { errorMessage } from "@/utils/errorToast";
import type { McpPrompt, McpResource, McpResourceTemplate, McpTool } from "./config";

export type CatalogTab = "tools" | "prompts" | "resources";
type CatalogItem<TKind, TValue> = { kind: TKind; id: string; title: string; detail?: string; value: TValue };
export type McpEntry =
  | CatalogItem<"tool", McpTool>
  | CatalogItem<"prompt", McpPrompt>
  | CatalogItem<"resource", McpResource>
  | CatalogItem<"template", McpResourceTemplate>;

export async function loadCatalog(sessionId: string, tab: CatalogTab): Promise<{ entries: McpEntry[]; error?: string }> {
  if (tab === "tools") {
    const tools = await mcpApi.listTools(sessionId);
    return { entries: tools.map((value) => ({
      kind: "tool", id: value.name, title: value.title || value.name, detail: value.name, value,
    })) };
  }
  if (tab === "prompts") {
    const prompts = await mcpApi.listPrompts(sessionId);
    return { entries: prompts.map((value) => ({
      kind: "prompt", id: value.name, title: value.title || value.name, detail: value.name, value,
    })) };
  }
  const [resources, templates] = await Promise.allSettled([
    mcpApi.listResources(sessionId),
    mcpApi.listResourceTemplates(sessionId),
  ]);
  const entries: McpEntry[] = [];
  if (resources.status === "fulfilled") entries.push(...resources.value.map((value): McpEntry => ({
    kind: "resource", id: value.uri, title: value.title || value.name, detail: value.uri, value,
  })));
  if (templates.status === "fulfilled") entries.push(...templates.value.map((value): McpEntry => ({
    kind: "template", id: value.uriTemplate, title: value.title || value.name, detail: value.uriTemplate, value,
  })));
  const errors = [resources, templates].flatMap((result) => result.status === "rejected" ? [errorMessage(result.reason)] : []);
  return { entries, error: [...new Set(errors)].join("\n") || undefined };
}
