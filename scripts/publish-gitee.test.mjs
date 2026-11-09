import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));

const originalArgv = process.argv;
let fetchMock;

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("GITEE_TOKEN", "test-token");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  process.argv = ["node", "publish-gitee.mjs", "v0.11.0", "assets"];
});

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("同步 Windows 安装包并写入更新信息", async () => {
  const installer = "Open.Tools_0.11.0_x64-setup.exe";
  const installerUrl = `https://gitee.com/bulua/open-tools/releases/download/v0.11.0/${installer}`;
  readFile.mockImplementation(async (path) => String(path).endsWith("latest.json")
    ? JSON.stringify({ version: "0.11.0", platforms: { "windows-x86_64": { url: `https://github.com/example/${installer}` } } })
    : Buffer.from("exe"));
  fetchMock.mockImplementation(async (url, init) => {
    if (url.includes("/releases/tags/")) return response({ id: 123 });
    if (url.includes("/attach_files")) return response([{ name: installer, size: 3, browser_download_url: installerUrl }]);
    if (!init.method) return response({}, 404);
    return response({});
  });

  await import("./publish-gitee.mjs");

  const write = fetchMock.mock.calls.find(([url, init]) => url.includes("/contents/latest.json") && init.method === "POST");
  expect(write).toBeDefined();
  const manifest = JSON.parse(Buffer.from(write[1].body.get("content"), "base64").toString());
  expect(manifest.platforms["windows-x86_64"].url).toBe(installerUrl);
});
