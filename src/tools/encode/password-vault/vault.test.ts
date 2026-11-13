import { describe, expect, it } from "vitest";
import { createSession, decryptVault, encryptVault, matchEntry, newEntry, type VaultEntry } from "./vault";

// 测试里减少派生次数，跑得快一些
const ITERATIONS = 1000;
const entry = (over: Partial<VaultEntry>): VaultEntry => ({ ...newEntry(), ...over });

describe("密码本：加密与解密", () => {
  it("用同一个主密码可以解开，内容不变", async () => {
    const entries = [entry({ title: "GitHub", username: "me", password: "p@ss 中文" })];
    const session = await createSession("主密码123", ITERATIONS);
    const text = await encryptVault(session, entries);
    const opened = await decryptVault(text, "主密码123");
    expect(opened.entries).toEqual(entries);
    expect(opened.session.iterations).toBe(ITERATIONS);
  });

  it("文件里没有明文", async () => {
    const session = await createSession("pw", ITERATIONS);
    const text = await encryptVault(session, [entry({ title: "GitHub", password: "secret-value" })]);
    expect(text).not.toContain("GitHub");
    expect(text).not.toContain("secret-value");
  });

  it("主密码错误时报错", async () => {
    const text = await encryptVault(await createSession("right", ITERATIONS), []);
    await expect(decryptVault(text, "wrong")).rejects.toThrow("主密码不正确");
  });

  it("密文被改动时报错", async () => {
    const text = await encryptVault(await createSession("pw", ITERATIONS), [entry({ title: "a" })]);
    const file = JSON.parse(text);
    file.data = (file.data[0] === "A" ? "B" : "A") + file.data.slice(1);
    await expect(decryptVault(JSON.stringify(file), "pw")).rejects.toThrow("主密码不正确");
  });

  it("每次保存用新的 IV，解开后的密钥可以继续保存", async () => {
    const session = await createSession("pw", ITERATIONS);
    const a = JSON.parse(await encryptVault(session, []));
    const b = JSON.parse(await encryptVault(session, []));
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).toBe(b.salt);

    const opened = await decryptVault(JSON.stringify(a), "pw");
    const again = await encryptVault(opened.session, [entry({ title: "x" })]);
    expect((await decryptVault(again, "pw")).entries[0].title).toBe("x");
  });

  it("不是密码本文件时报错", async () => {
    await expect(decryptVault("not json", "pw")).rejects.toThrow("已损坏");
    await expect(decryptVault('{"version":2}', "pw")).rejects.toThrow("不支持");
  });
});

describe("密码本：搜索", () => {
  it("按名称、账号、网址、备注匹配，不区分大小写", () => {
    const e = entry({ title: "GitHub", username: "Me@mail.com", url: "https://github.com", note: "工作用" });
    expect(matchEntry(e, "")).toBe(true);
    expect(matchEntry(e, "github")).toBe(true);
    expect(matchEntry(e, "me@MAIL")).toBe(true);
    expect(matchEntry(e, "工作")).toBe(true);
    expect(matchEntry(e, "gitlab")).toBe(false);
  });
});
