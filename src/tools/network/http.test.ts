import { describe, expect, it } from "vitest";
import { parseInput } from "./headers";
import {
  applyQuery,
  detectKind,
  emptyRow,
  friendlyError,
  fromParsed,
  hexDump,
  newRequest,
  normalizeUrl,
  parseQuery,
  prepareRequest,
  responseFileName,
  toCurlCommand,
  type RequestModel,
} from "./http";

const model = (patch: Partial<RequestModel>): RequestModel => ({ ...newRequest(), url: "https://api.example.com/users", ...patch });

describe("HTTP 请求：网址与参数", () => {
  it("补全协议", () => {
    expect(normalizeUrl("example.com/a")).toBe("https://example.com/a");
    expect(normalizeUrl("localhost:3000/api")).toBe("http://localhost:3000/api");
    expect(normalizeUrl("http://x.com")).toBe("http://x.com");
  });

  it("解析和写回查询参数，保留顺序、中文、没有值的参数和 #", () => {
    const params = parseQuery("https://a.com/s?q=%E4%BD%A0%E5%A5%BD+x&page=2&flag#top");
    expect(params.map((p) => [p.key, p.value])).toEqual([
      ["q", "你好 x"],
      ["page", "2"],
      ["flag", ""],
    ]);
    params[1].enabled = false;
    expect(applyQuery("https://a.com/s?old=1#top", [...params, emptyRow()])).toBe("https://a.com/s?q=%E4%BD%A0%E5%A5%BD+x&flag#top");
    expect(applyQuery("https://a.com/s?old=1", [])).toBe("https://a.com/s");
  });
});

describe("HTTP 请求：组装请求", () => {
  it("请求头、Bearer 认证、JSON 请求体自动加 Content-Type", () => {
    const r = prepareRequest(
      model({
        method: "POST",
        headers: [{ enabled: true, key: "Accept", value: "application/json" }, { enabled: false, key: "X-Off", value: "1" }, emptyRow()],
        auth: { type: "bearer", token: "abc", username: "", password: "" },
        bodyType: "json",
        bodyText: '{"a":1}',
      }),
    );
    expect(r.headers).toEqual([
      ["Accept", "application/json"],
      ["Authorization", "Bearer abc"],
      ["Content-Type", "application/json"],
    ]);
    expect(r.body).toBe('{"a":1}');
  });

  it("自己设置的 Content-Type、Authorization 优先；Basic 认证支持中文", () => {
    const r = prepareRequest(
      model({
        method: "PUT",
        headers: [{ enabled: true, key: "content-type", value: "application/vnd.api+json" }],
        auth: { type: "basic", token: "", username: "张三", password: "p" },
        bodyType: "json",
        bodyText: "{}",
      }),
    );
    expect(r.headers).toEqual([
      ["content-type", "application/vnd.api+json"],
      ["Authorization", `Basic ${Buffer.from("张三:p").toString("base64")}`],
    ]);
  });

  it("表单、multipart、GET 不带请求体", () => {
    const form = prepareRequest(model({ method: "POST", bodyType: "form", form: [{ enabled: true, key: "a", value: "1 2" }, { enabled: true, key: "b", value: "中" }] }));
    expect(form.body).toBe("a=1+2&b=%E4%B8%AD");
    expect(form.headers).toContainEqual(["Content-Type", "application/x-www-form-urlencoded"]);

    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    const multi = prepareRequest(model({ method: "POST", bodyType: "multipart", multipart: [{ enabled: true, key: "f", value: "", file }, { enabled: true, key: "n", value: "x" }] }));
    expect(multi.body).toBeInstanceOf(FormData);
    expect((multi.body as FormData).get("f")).toBeInstanceOf(File);
    expect(multi.headers.some(([k]) => k.toLowerCase() === "content-type")).toBe(false);

    expect(prepareRequest(model({ method: "GET", bodyType: "json", bodyText: "{}" })).body).toBeNull();
  });

  it("地址错误给出提示", () => {
    expect(() => prepareRequest(model({ url: "" }))).toThrow("请输入请求地址");
    expect(() => prepareRequest(model({ url: "http://" }))).toThrow("格式不正确");
  });
});

describe("HTTP 请求：cURL", () => {
  it("导入 cURL：方法、请求头、JSON 请求体、查询参数", () => {
    const m = fromParsed(parseInput(`curl 'https://a.com/api?x=1' -H 'Content-Type: application/json' -H 'X-Token: t' --data-raw '{"name":"a"}'`));
    expect(m.method).toBe("POST");
    expect(m.params[0]).toMatchObject({ key: "x", value: "1" });
    expect(m.headers.filter((h) => h.key).map((h) => h.key)).toEqual(["Content-Type", "X-Token"]);
    expect(m.bodyType).toBe("json");
    expect(m.bodyText).toBe('{\n  "name": "a"\n}');
  });

  it("导入表单请求", () => {
    const m = fromParsed(parseInput(`curl https://a.com -H 'content-type: application/x-www-form-urlencoded' -d 'a=1&b=2'`));
    expect(m.bodyType).toBe("form");
    expect(m.form.filter((f) => f.key).map((f) => [f.key, f.value])).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("复制为 cURL", () => {
    const cmd = toCurlCommand(model({ method: "POST", bodyType: "json", bodyText: `{"it's":1}` }));
    expect(cmd).toContain("curl 'https://api.example.com/users'");
    expect(cmd).toContain("-X POST");
    expect(cmd).toContain(`--data-raw '{"it'\\''s":1}'`);
  });
});

describe("HTTP 请求：识别响应内容", () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it("按 Content-Type 识别", () => {
    expect(detectKind("application/json; charset=utf-8", bytes("{}")).kind).toBe("json");
    expect(detectKind("application/problem+json", bytes("{}")).kind).toBe("json");
    expect(detectKind("text/html", bytes("<p>")).kind).toBe("html");
    expect(detectKind("image/svg+xml", bytes("<svg/>")).kind).toBe("image");
    expect(detectKind("video/mp4", new Uint8Array(4)).kind).toBe("video");
  });

  it("Content-Type 不准确时按内容识别", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectKind("application/octet-stream", png)).toEqual({ kind: "image", mime: "image/png" });
    expect(detectKind("", bytes("%PDF-1.7")).kind).toBe("pdf");
    expect(detectKind("", bytes('[{"a":1}]')).kind).toBe("json");
    expect(detectKind("", bytes("<!DOCTYPE html><html>")).kind).toBe("html");
    expect(detectKind("", bytes("hello world")).kind).toBe("text");
    expect(detectKind("", new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 1, 2])).kind).toBe("binary");
  });

  it("保存的文件名", () => {
    expect(responseFileName([["Content-Disposition", "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.xlsx"]], "https://a.com/x", "application/octet-stream")).toBe("报告.xlsx");
    expect(responseFileName([["content-disposition", 'attachment; filename="a b.zip"']], "https://a.com/x", "")).toBe("a b.zip");
    expect(responseFileName([], "https://a.com/files/photo.jpg?v=1", "image/jpeg")).toBe("photo.jpg");
    expect(responseFileName([], "https://a.com/api/users", "application/json")).toBe("users.json");
    expect(responseFileName([], "https://a.com/", "image/png")).toBe("response.png");
  });

  it("十六进制预览", () => {
    const dump = hexDump(new Uint8Array([0x41, 0x42, 0x00, 0xff]));
    expect(dump).toBe(`00000000  41 42 00 ff${" ".repeat(36)}  AB..`);
  });

  it("常见错误换成中文说明", () => {
    expect(friendlyError("getaddrinfo ENOTFOUND abc.invalid")).toContain("找不到这个域名");
    expect(friendlyError("connect ECONNREFUSED 127.0.0.1:1")).toContain("连接被拒绝");
  });
});
