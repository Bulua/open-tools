import { describe, expect, it } from "vitest";
import { NAMING_STYLES, convertLines, splitWords } from "./transforms";

const style = (label: string) => NAMING_STYLES.find((s) => s.label === label)!.convert;

describe("命名风格转换", () => {
  it("识别各种写法的单词", () => {
    for (const input of ["helloBigWorld", "HelloBigWorld", "hello_big_world", "hello-big world", "HELLO_BIG_WORLD"]) {
      expect(splitWords(input)).toEqual(["hello", "big", "world"]);
    }
    expect(splitWords("parseHTTPResponse")).toEqual(["parse", "http", "response"]);
  });

  it("转换为各种风格", () => {
    expect(style("小驼峰")("user_name")).toBe("userName");
    expect(style("大驼峰")("user_name")).toBe("UserName");
    expect(style("下划线")("userName")).toBe("user_name");
    expect(style("常量")("userName")).toBe("USER_NAME");
    expect(style("短横线")("UserName")).toBe("user-name");
    expect(style("点分隔")("userName")).toBe("user.name");
  });

  it("多行逐行转换", () => {
    expect(convertLines("user_name\norder_id", style("小驼峰"))).toBe("userName\norderId");
  });
});
