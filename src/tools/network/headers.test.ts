import { describe, expect, it } from "vitest";
import { filterHeaders, parseInput, splitCommand, toCurl, toFetch, toHeaderObject, toJson, toPython } from "./headers";

describe("解析输入", () => {
  it("原始请求头（含请求行）", () => {
    const req = parseInput("GET /api/list?page=1 HTTP/1.1\nHost: example.com\nAccept: application/json\nCookie: a=1");
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://example.com/api/list?page=1");
    expect(req.headers).toContainEqual(["Accept", "application/json"]);
  });

  it("Chrome 的 HTTP/2 伪头部与「键、值分两行」", () => {
    const req = parseInput(":authority:\napi.example.com\n:method:\nPOST\n:path:\n/v1/users\n:scheme:\nhttps\naccept:\n*/*\ncontent-type:\napplication/json");
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://api.example.com/v1/users");
    expect(req.headers).toEqual([
      ["accept", "*/*"],
      ["content-type", "application/json"],
    ]);
  });

  it("cURL 命令（bash 与 Windows CMD 写法）", () => {
    const bash = parseInput(["curl 'https://a.com/x' \\", "  -H 'Authorization: Bearer t' \\", "  -H 'Content-Type: application/json' \\", `  --data-raw '{"a":"it'\\''s"}'`].join("\n"));
    expect(bash).toMatchObject({ method: "POST", url: "https://a.com/x", body: `{"a":"it's"}` });
    expect(bash.headers).toContainEqual(["Authorization", "Bearer t"]);
    const cmd = parseInput(`curl "https://a.com/y" ^\n  -H "Accept: */*" ^\n  -X DELETE`);
    expect(cmd).toMatchObject({ method: "DELETE", url: "https://a.com/y" });
    expect(splitCommand(`curl -b "a=1" --user-agent=UA`)).toEqual(["curl", "-b", "a=1", "--user-agent=UA"]);
  });

  it("JSON 对象", () => {
    expect(parseInput('{"Accept":"*/*","X-Ids":[1,2]}').headers).toEqual([
      ["Accept", "*/*"],
      ["X-Ids", "1"],
      ["X-Ids", "2"],
    ]);
    expect(() => parseInput("{bad")).toThrow("JSON 格式有误");
  });
});

describe("生成", () => {
  const req = parseInput("POST /login HTTP/1.1\nHost: a.com\nContent-Type: application/json\nContent-Length: 12\nCookie: a=1\nCookie: b=2");
  req.body = '{"u":"x"}';

  it("JSON：同名合并", () => {
    expect(toHeaderObject(req.headers).Cookie).toBe("a=1; b=2");
    expect(JSON.parse(toJson(req.headers))["Content-Type"]).toBe("application/json");
  });

  it("过滤自动生成的头和 Cookie", () => {
    expect(filterHeaders(req.headers, { dropAuto: true, dropCookie: true }).map(([k]) => k)).toEqual(["Content-Type"]);
  });

  it("cURL / fetch / Python", () => {
    const h = filterHeaders(req.headers, { dropAuto: true, dropCookie: false });
    expect(toCurl(req, h).split("\n")).toEqual([
      "curl 'https://a.com/login' \\",
      "  -H 'Content-Type: application/json' \\",
      "  -H 'Cookie: a=1' \\",
      "  -H 'Cookie: b=2' \\",
      `  --data-raw '{"u":"x"}'`,
    ]);
    expect(toCurl(req, h, "cmd")).toContain(`--data-raw "{\\"u\\":\\"x\\"}"`);
    expect(toFetch(req, h)).toContain(`method: "POST"`);
    expect(toPython(req, h)).toContain("requests.post(");
    // 生成的 cURL 可以再解析回来
    expect(parseInput(toCurl(req, h)).body).toBe(req.body);
  });
});
