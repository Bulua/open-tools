import { describe, expect, it } from "vitest";
import { mergeMessages } from "./mergeMessages";

describe("拆分工具文案的合并", () => {
  it("保留同一命名空间下不同工具的文案，支持多层嵌套和数组", () => {
    const messages = { convert: { timezone: { title: "时区" }, units: "单位" }, common: "公共" };
    mergeMessages(messages, { convert: { timezone: { hint: "选择城市" }, naming: ["驼峰", "下划线"] } });
    expect(messages).toEqual({
      convert: { timezone: { title: "时区", hint: "选择城市" }, units: "单位", naming: ["驼峰", "下划线"] },
      common: "公共",
    });
  });
});
