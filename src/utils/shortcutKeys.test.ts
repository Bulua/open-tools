import { describe, expect, it } from "vitest";
import { shortcutFromKeyboard, shortcutModifiers } from "./shortcutKeys";

const key = (code: string, modifiers: Partial<KeyboardEvent> = {}) => ({
  code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, isComposing: false, ...modifiers,
});

describe("截图快捷键录入", () => {
  it("按修饰键与主键生成可注册的组合，不依赖输入法产生的字符", () => {
    expect(shortcutFromKeyboard(key("KeyA", { ctrlKey: true, shiftKey: true, key: "啊" }))).toBe("Ctrl+Shift+A");
    expect(shortcutFromKeyboard(key("Digit1", { altKey: true, shiftKey: true, key: "!" }))).toBe("Alt+Shift+1");
  });

  it("只按修饰键时仅预览，不能形成待保存的快捷键", () => {
    const event = key("ShiftLeft", { ctrlKey: true, shiftKey: true });
    expect(shortcutModifiers(event)).toEqual(["Ctrl", "Shift"]);
    expect(shortcutFromKeyboard(event)).toBeUndefined();
  });

  it("区分数字区和小键盘，支持功能键、方向键", () => {
    expect(shortcutFromKeyboard(key("Digit2", { ctrlKey: true }))).toBe("Ctrl+2");
    expect(shortcutFromKeyboard(key("Numpad2", { ctrlKey: true }))).toBe("Ctrl+Numpad2");
    expect(shortcutFromKeyboard(key("F8"))).toBe("F8");
    expect(shortcutFromKeyboard(key("ArrowUp", { altKey: true }))).toBe("Alt+ArrowUp");
  });

  it("回车被录入为快捷键主键，不作为保存动作", () => {
    expect(shortcutFromKeyboard(key("Enter", { ctrlKey: true }))).toBe("Ctrl+Enter");
  });

  it("忽略组合输入和不支持的设备按键", () => {
    expect(shortcutFromKeyboard(key("KeyA", { isComposing: true }))).toBeUndefined();
    expect(shortcutFromKeyboard(key("Unidentified"))).toBeUndefined();
    expect(shortcutFromKeyboard(key("F25"))).toBeUndefined();
  });
});
