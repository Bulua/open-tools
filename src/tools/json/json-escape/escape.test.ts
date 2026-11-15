import { describe, expect, it } from "vitest";
import { escapeJson, unescapeJson } from "./escape";

describe("转义", () => {
  it("转义与去转义互为逆操作", () => {
    const raw = '{"name":"Open Tools"}\n';
    expect(escapeJson(raw)).toBe('{\\"name\\":\\"Open Tools\\"}\\n');
    expect(unescapeJson(escapeJson(raw))).toBe(raw);
  });

  it("去转义时两侧有引号也可以", () => {
    expect(unescapeJson('"a\\tb"')).toBe("a\tb");
  });
});
