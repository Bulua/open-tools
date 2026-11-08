type ShortcutKeyEvent = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "isComposing">;

export function shortcutModifiers(event: ShortcutKeyEvent): string[] {
  return [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super"].filter((value): value is string => Boolean(value));
}

/** 使用物理按键 code，避免中文输入法、大小写和 Shift 符号改变快捷键。 */
export function shortcutFromKeyboard(event: ShortcutKeyEvent): string | undefined {
  if (event.isComposing) return;
  const code = event.code;
  const namedKeys = new Set([
    "Space", "Enter", "Escape", "Tab", "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown",
    "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PrintScreen", "Pause", "CapsLock", "NumLock", "ScrollLock",
    "Backquote", "Backslash", "BracketLeft", "BracketRight", "Comma", "Equal", "Minus", "Period", "Quote", "Semicolon", "Slash",
    "NumpadAdd", "NumpadDecimal", "NumpadDivide", "NumpadEnter", "NumpadEqual", "NumpadMultiply", "NumpadSubtract",
  ]);
  let key: string;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code) || /^Numpad[0-9]$/.test(code) || namedKeys.has(code)) key = code;
  else return;
  return [...shortcutModifiers(event), key].join("+");
}
