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
        option.scrollIntoView?.({ block: "nearest" });
      }
    });
  }

  function choose(value: string) {
    input.value = value;
    close();
    commit();
  }

  function show() {
    const query = input.value.trim().toLowerCase();
    matches = languages.filter(language => language.startsWith(query) || aliases[language]?.startsWith(query)).slice(0, 7);
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
    menu.removeAttribute("aria-hidden");
    const rect = input.getBoundingClientRect();
    const width = Math.min(win.innerWidth - 16, Math.max(rect.width, 116));
    menu.style.width = `${width}px`;
    const below = win.innerHeight - rect.bottom - 9;
    const above = rect.top - 9;
    menu.style.maxHeight = `${Math.max(0, Math.max(below, above))}px`;
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

  input.addEventListener("focus", show);
  input.addEventListener("click", () => { if (!opened) show(); });
  input.addEventListener("input", event => { if (!(event as InputEvent).isComposing) show(); });
  input.addEventListener("compositionend", show);
  input.addEventListener("change", commit);
  input.addEventListener("blur", () => { close(); commit(); });
  input.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0) choose(matches[active]);
      else { close(); commit(); }
    } else if (event.key === "Escape" && opened) {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!opened) show();
      if (!opened) return;
      event.preventDefault();
      const next = active < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1)
        : (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      mark(next);
    }
  });
  return () => {
    close();
    animation?.cancel();
    menu.remove();
  };
}
