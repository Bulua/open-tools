import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, stat } from "node:fs/promises";
import { request } from "node:https";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), stat: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));

const originalArgv = process.argv;
const apkName = "OpenTools_0.11.0_arm64-v8a.apk";
const assetUrl = `https://gitee.com/bulua/open-tools/releases/download/v0.11.0/${apkName}`;
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
  process.argv = ["node", "publish-gitee.mjs", "v0.11.0", "assets", "--apk-only"];
  readFile.mockResolvedValue(Buffer.from("apk"));
  stat.mockResolvedValue({ size: 3 });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Gitee APK 同步", () => {
  it("复用已有的同名同大小 APK，不读取或改写 Windows 更新信息", async () => {
    fetchMock.mockResolvedValueOnce(response({ id: 123 }));
    fetchMock.mockImplementation(async () => response([{ name: apkName, size: 3, browser_download_url: assetUrl }]));

    await import("./publish-gitee.mjs");

    expect(request).not.toHaveBeenCalled();
    expect(readFile.mock.calls.every(([path]) => String(path).endsWith(apkName))).toBe(true);
    expect(fetchMock.mock.calls.every(([url, init]) => !url.includes("/contents/") && !init.method)).toBe(true);
    expect(console.log).toHaveBeenCalledWith(`已同步 ${apkName} → ${assetUrl}`);
  });

  it("Gitee 无权限时直接报错，不创建 Release 或修改更新分支", async () => {
    fetchMock.mockResolvedValueOnce(response({ message: "Forbidden" }, 403));
    await expect(import("./publish-gitee.mjs")).rejects.toThrow("读取 Gitee Release 失败（403）");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it("APK 超过上限时上传 ZIP，保留原 APK 的文件内容", async () => {
    stat.mockResolvedValueOnce({ size: 236337855 }).mockResolvedValue({ size: 77017550 });
    fetchMock.mockResolvedValueOnce(response({ id: 123 }));
    fetchMock.mockImplementation(async () => response([{ name: apkName + ".zip", size: 3, browser_download_url: assetUrl + ".zip" }]));
    await import("./publish-gitee.mjs");
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining(apkName + ".zip"));
    expect(request).not.toHaveBeenCalled();
  });

  it("压缩包仍超限时停止上传", async () => {
    stat.mockResolvedValue({ size: 236337855 });
    await expect(import("./publish-gitee.mjs")).rejects.toThrow("APK 附件超过 Gitee 单附件上限");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("拒绝不合法的 APK 版本标签", async () => {
    process.argv[2] = "master";
    await expect(import("./publish-gitee.mjs")).rejects.toThrow("APK 标签必须采用");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("原有 Windows 模式仍同步安装包并写入更新信息", async () => {
    process.argv.pop();
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
});
