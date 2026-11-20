// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { attachLanguageSuggestions } from "./codeLanguage";

test("打开语言列表可浏览全部项目，操作滚动条后仍可以选择末尾语言", () => {
  const languages = ["arduino", "bash", "c", "cpp", "csharp", "css", "go", "javascript", "python", "yaml"];
  const input = document.body.appendChild(document.createElement("input"));
  const commit = vi.fn();
  const dispose = attachLanguageSuggestions(input, languages, commit);
  try {
    input.value = "javascript";
    input.focus();
    const menu = document.getElementById(input.getAttribute("aria-controls")!)!;
    expect(menu.querySelectorAll('[role="option"]')).toHaveLength(languages.length);
    menu.focus();
    menu.dispatchEvent(new Event("scroll"));
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(commit).not.toHaveBeenCalled();
    (menu.lastElementChild as HTMLElement).click();
    expect(input.value).toBe("yaml");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(commit).toHaveBeenCalledOnce();

    input.value = "js";
    input.dispatchEvent(new InputEvent("input"));
    expect(menu.textContent).toBe("JavaScript");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(input.value).toBe("javascript");
  } finally {
    dispose();
    input.remove();
  }
});
