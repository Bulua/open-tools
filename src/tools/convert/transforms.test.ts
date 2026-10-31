import { describe, expect, it } from "vitest";
import { toCamel, toSnake } from "./transforms";

describe("大小写转换", () => {
  it("驼峰", () => {
    expect(toCamel("hello_world")).toBe("helloWorld");
    expect(toCamel("hello-big world")).toBe("helloBigWorld");
  });

  it("下划线", () => {
    expect(toSnake("helloWorld")).toBe("hello_world");
    expect(toSnake("hello-big world")).toBe("hello_big_world");
  });
});
