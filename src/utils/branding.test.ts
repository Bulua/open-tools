import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickIcon, resolveAsset, sha256Hex, type BrandingManifest } from "./branding";
// @ts-expect-error 脚本是普通的 .mjs，没有类型声明
import { addIcon, useIcon, validId } from "../../scripts/branding.mjs";

const icon = (id: string) => ({ id, name: id, added: "2026-11-03", png: `icons/${id}.png`, ico: `icons/${id}.ico`, sha256: { png: "a", ico: "b" } });
const manifest = (current: string | null): BrandingManifest => ({ current, icons: [icon("classic"), icon("orange")] });

describe("远程图标配置", () => {
  it("current 指向的图标", () => {
    expect(pickIcon(manifest("classic"))).toEqual({ kind: "icon", icon: icon("classic") });
  });

  it("current 为空或 default 时用程序自带的图标", () => {
    expect(pickIcon(manifest(null)).kind).toBe("default");
    expect(pickIcon(manifest("default")).kind).toBe("default");
  });

  it("current 指向不存在的图标、缺少校验值时当作配置写错了", () => {
    expect(pickIcon(manifest("missing")).kind).toBe("invalid");
    const broken = { current: "x", icons: [{ ...icon("x"), sha256: { png: "", ico: "b" } }] };
    expect(pickIcon(broken).kind).toBe("invalid");
  });

  it("图片地址相对配置文件，从哪儿读的配置就从哪儿下载", () => {
    expect(resolveAsset("https://gitee.com/bulua/open-tools/raw/master/branding/icon.json", "icons/orange.png")).toBe(
      "https://gitee.com/bulua/open-tools/raw/master/branding/icons/orange.png",
    );
  });

  it("SHA-256 校验值", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("仓库里的配置有效，校验值和文件一致", async () => {
    const real = JSON.parse(readFileSync("branding/icon.json", "utf8")) as BrandingManifest;
    expect(pickIcon(real).kind).not.toBe("invalid");
    for (const i of real.icons) {
      expect(validId(i.id)).toBe(true);
      expect(await sha256Hex(readFileSync(`branding/${i.png}`))).toBe(i.sha256.png);
      expect(await sha256Hex(readFileSync(`branding/${i.ico}`))).toBe(i.sha256.ico);
    }
  });
});

describe("图标管理脚本", () => {
  it("加入新图标并换上，历史保留", () => {
    const next = addIcon(manifest("orange"), icon("spring"));
    expect(next.current).toBe("spring");
    expect(next.icons.map((i: { id: string }) => i.id)).toEqual(["classic", "orange", "spring"]);
  });

  it("不能覆盖已有的图标，不能用 default 和不合法的 id", () => {
    expect(() => addIcon(manifest("orange"), icon("classic"))).toThrow();
    expect(() => addIcon(manifest("orange"), icon("default"))).toThrow();
    expect(() => addIcon(manifest("orange"), icon("Spring 2027"))).toThrow();
  });

  it("切换到历史图标或程序自带的图标", () => {
    expect(useIcon(manifest("orange"), "classic").current).toBe("classic");
    expect(useIcon(manifest("orange"), "default").current).toBe("default");
    expect(() => useIcon(manifest("orange"), "missing")).toThrow();
  });
});
