import { prefersReducedMotion } from "@/utils/motion";

const labels: Record<string, string> = { c: "C", cpp: "C++", csharp: "C#", javascript: "JavaScript", typescript: "TypeScript" };
const aliases: Record<string, string> = { cpp: "c++", csharp: "c#", javascript: "js", typescript: "ts", bash: "sh", python: "py" };
let menuCount = 0;

export function attachLanguageSuggestions(input: HTMLInputElement, languages: string[], commit: () => void) {
  const doc = input.ownerDocument;
  const win = doc.defaultView!;
  const menu = doc.createElement("div");
  menu.id = `notebook-language-${++menuCount}`;
  menu.className = "select-menu notebook-language-menu";
  menu.tabIndex = -1;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", input.getAttribute("aria-label") ?? "");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", menu.id);
  let matches: string[] = [];
  let active = -1;
  let opened = false;
  let aboveInput = false;
  let animation: Animation | undefined;

  function animate(expand: boolean) {
    animation?.cancel();
    animation = undefined;
    if (prefersReducedMotion() || !menu.animate) {
      if (!expand) menu.remove();
      return;
    }
    const collapsed = {
      clipPath: aboveInput ? "inset(100% 0 0 0)" : "inset(0 0 100% 0)",
      transform: aboveInput ? "translateY(3px)" : "translateY(-3px)",
    };
    const expanded = { clipPath: "inset(-18px)", transform: "translateY(0)" };
    const easing = win.getComputedStyle(menu).getPropertyValue("--ease-out").trim() || "ease-out";
    animation = menu.animate(expand ? [collapsed, expanded] : [expanded, collapsed], {
      duration: expand ? 160 : 110, easing, fill: "backwards",
    });
    animation.onfinish = () => { if (!expand && !opened) menu.remove(); };
  }

  function close() {
    if (!opened) return;
    opened = false;
    menu.setAttribute("aria-hidden", "true");
    animate(false);
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    doc.removeEventListener("scroll", onScroll, true);
    win.removeEventListener("resize", close);
    active = -1;
  }

  function onScroll(event: Event) {
    if (event.target !== menu) close();
  }

  function mark(index: number) {
    active = index;
    menu.querySelectorAll<HTMLElement>("[role=option]").forEach((option, i) => {
      option.setAttribute("aria-selected", String(i === active));
      if (i === active) {
        input.setAttribute("aria-activedescendant", option.id);
        const optionRect = option.getBoundingClientRect();
        const menuTop = menu.getBoundingClientRect().top + menu.clientTop;
        const menuBottom = menuTop + menu.clientHeight;
        if (optionRect.top < menuTop) menu.scrollTop -= menuTop - optionRect.top;
        else if (optionRect.bottom > menuBottom) menu.scrollTop += optionRect.bottom - menuBottom;
      }
    });
  }

  function choose(value: string) {
    if (doc.activeElement === menu) input.focus({ preventScroll: true });
    input.value = value;
    close();
    commit();
  }

  function show(query = "") {
    matches = languages.filter(language => language.startsWith(query) || aliases[language]?.startsWith(query));
    if (!matches.length) { close(); return; }
    active = -1;
    input.removeAttribute("aria-activedescendant");
    menu.replaceChildren(...matches.map((value, index) => {
      const option = doc.createElement("div");
      option.id = `${menu.id}-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.textContent = labels[value] ?? value;
      option.addEventListener("mousedown", event => event.preventDefault());
      option.addEventListener("click", () => choose(value));
      return option;
    }));
    if (!menu.isConnected) doc.body.append(menu);
    menu.scrollTop = 0;
    menu.removeAttribute("aria-hidden");
    const rect = input.getBoundingClientRect();
    const width = Math.min(win.innerWidth - 16, Math.max(rect.width, 116));
    menu.style.width = `${width}px`;
    const below = win.innerHeight - rect.bottom - 9;
    const above = rect.top - 9;
    menu.style.maxHeight = `${Math.max(0, Math.min(240, Math.max(below, above)))}px`;
    const openBelow = below >= menu.offsetHeight || below >= above;
    aboveInput = !openBelow;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, win.innerWidth - width - 8))}px`;
    menu.style.top = `${openBelow ? rect.bottom + 4 : Math.max(8, rect.top - menu.offsetHeight - 4)}px`;
    input.setAttribute("aria-expanded", "true");
    if (!opened) animate(true);
    opened = true;
    doc.addEventListener("scroll", onScroll, true);
    win.addEventListener("resize", close);
  }

  function filter() {
    show(input.value.trim().toLowerCase());
  }

  function onBlur(event: FocusEvent) {
    const next = event.relatedTarget;
    // 操作滚动条可能把焦点移到列表里，只有离开整个控件时才收起。
    if (next === input || next === menu) return;
    close();
    commit();
  }

  input.addEventListener("focus", () => { if (!opened) show(); });
  input.addEventListener("click", () => { if (!opened) show(); });
  input.addEventListener("input", event => { if (!(event as InputEvent).isComposing) filter(); });
  input.addEventListener("compositionend", filter);
  input.addEventListener("blur", onBlur);
  menu.addEventListener("blur", onBlur);
  function onKeyDown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0) choose(matches[active]);
      else { choose(input.value); }
    } else if (event.key === "Escape" && opened) {
      event.preventDefault();
      if (doc.activeElement === menu) input.focus({ preventScroll: true });
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!opened) show();
      if (!opened) return;
      event.preventDefault();
      const next = active < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1)
        : (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      mark(next);
    }
  }
  input.addEventListener("keydown", onKeyDown);
  menu.addEventListener("keydown", onKeyDown);
  return () => {
    close();
    animation?.cancel();
    menu.remove();
  };
}
