// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { i18n } from "@/locales";
import AiMessageItem from "./components/AiMessageItem.vue";
import AiWorkspace from "./components/AiWorkspace.vue";
import { resetAiStoreForTest } from "./store";

beforeEach(() => {
  localStorage.clear();
  resetAiStoreForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

test("通过左下角设置获取并配置多个模型、新增提示词、查看 MCP，并在输入框底部切换模型完成对话", async () => {
  const encoder = new TextEncoder();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return new Response(
        JSON.stringify({
          data: [
            { id: "gpt-4.1" },
            { id: "o3-mini" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"检查问题"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"这是测试回复"}}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  });

  const host = document.body.appendChild(document.createElement("div"));
  const app = createApp(AiWorkspace).use(i18n);
  app.mount(host);

  try {
    await vi.waitFor(() => {
      expect(host.querySelector(".settings-btn")?.textContent?.trim()).toBe("设置");
    });

    // 1. 点击左下角「设置」弹出设置面板，左侧包含 模型配置 / MCP / 提示词 / 通用设置
    host.querySelector<HTMLButtonElement>(".settings-btn")!.click();
    await nextTick();
    const dialog = host.querySelector<HTMLElement>(".settings-dialog")!;
    expect(dialog).not.toBeNull();
    const navTexts = Array.from(dialog.querySelectorAll(".dialog-nav .nav-name")).map((el) => el.textContent?.trim());
    expect(navTexts).toEqual(["模型配置", "MCP", "提示词", "通用设置"]);

    // 2. 在模型配置中新增模型：填写 API Key -> 点击获取模型列表 -> 勾选两个模型一次性配置
    dialog.querySelector<HTMLButtonElement>(".panel-header .primary")!.click();
    await nextTick();
    setInputValue(dialog.querySelector<HTMLInputElement>("#ai-model-apikey")!, "sk-multi-key");
    await nextTick();

    const fetchBtn = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
      btn.textContent?.includes("获取模型列表"),
    )!;
    fetchBtn.click();

    await vi.waitFor(() => {
      expect(dialog.querySelectorAll(".remote-option input[type='checkbox']").length).toBe(2);
    });
    for (const checkbox of dialog.querySelectorAll<HTMLInputElement>(".remote-option input[type='checkbox']")) {
      checkbox.click();
    }
    await nextTick();
    dialog.querySelector<HTMLButtonElement>(".form-footer .primary")!.click();
    await nextTick();

    expect(dialog.querySelectorAll(".item-card").length).toBe(2);

    // 3. 切到「提示词」新增一个提示词预设
    const promptTab = Array.from(dialog.querySelectorAll<HTMLButtonElement>(".dialog-nav .nav-item")).find((b) =>
      b.textContent?.includes("提示词"),
    )!;
    promptTab.click();
    await nextTick();
    dialog.querySelector<HTMLButtonElement>(".panel-header .primary")!.click();
    await nextTick();
    setInputValue(dialog.querySelector<HTMLInputElement>("#ai-prompt-name")!, "翻译助手");
    setInputValue(dialog.querySelector<HTMLTextAreaElement>("#ai-prompt-content")!, "请准确翻译用户输入");
    dialog.querySelector<HTMLButtonElement>(".form-footer .primary")!.click();
    await nextTick();
    expect(dialog.querySelector(".prompt-card .item-title")?.textContent).toBe("翻译助手");

    // 4. 切到「MCP」新增一个服务并验证持久化
    const mcpTab = Array.from(dialog.querySelectorAll<HTMLButtonElement>(".dialog-nav .nav-item")).find((b) =>
      b.textContent?.includes("MCP"),
    )!;
    mcpTab.click();
    await nextTick();
    dialog.querySelector<HTMLButtonElement>(".panel-header .primary")!.click();
    await nextTick();
    setInputValue(dialog.querySelector<HTMLInputElement>("#ai-mcp-name")!, "本地文件 MCP");
    setInputValue(dialog.querySelector<HTMLInputElement>("#ai-mcp-cmd")!, "npx");
    dialog.querySelector<HTMLButtonElement>(".form-footer .primary")!.click();
    await vi.waitFor(() => {
      expect(dialog.querySelector(".mcp-card .item-title")?.textContent).toBe("本地文件 MCP");
    });

    // 关闭设置面板
    dialog.querySelector<HTMLButtonElement>(".dialog-head .icon-btn")!.click();
    await nextTick();

    // 5. 输入框底栏不包含 MCP 按钮，包含左侧「+」文件上传按钮与分组模型选择器
    expect(host.querySelector(".composer-foot .mcp-pill")).toBeNull();
    expect(host.querySelector(".composer-foot .attach-btn")).not.toBeNull();

    const composerModelTrigger = host.querySelector<HTMLButtonElement>(".composer-foot .model-trigger");
    expect(composerModelTrigger).not.toBeNull();
    expect(composerModelTrigger?.textContent).toContain("gpt-4.1");

    composerModelTrigger!.click();
    await nextTick();
    // 菜单按提供商分组显示且不包含「管理模型配置」底部按钮
    expect(document.querySelector(".picker-menu .provider-heading")?.textContent?.trim()).toBe("OpenAI");
    expect(document.querySelector(".picker-menu .picker-foot")).toBeNull();

    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>(".picker-menu .model-row"));
    expect(rows.length).toBe(2);
    // 移到普通模型 gpt-4.1 上也会弹出右侧思考等级子菜单（关闭/低/中/高）
    const normalRow = rows.find((row) => row.textContent?.includes("gpt-4.1"))!;
    normalRow.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await nextTick();
    expect(
      Array.from(document.querySelectorAll<HTMLButtonElement>(".effort-submenu .effort-option")).map((b) => b.textContent?.trim()),
    ).toEqual(["关闭", "低", "中", "高"]);

    // 移到推理模型 o3-mini 上选择「高」
    const reasoningRow = rows.find((row) => row.textContent?.includes("o3-mini"))!;
    reasoningRow.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await nextTick();
    const effortButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".effort-submenu .effort-option"));
    expect(effortButtons.map((b) => b.textContent?.trim())).toEqual(["低", "中", "高"]);
    effortButtons[2].click();
    await nextTick();
    expect(composerModelTrigger?.textContent).toContain("o3-mini");
    expect(composerModelTrigger?.textContent).toContain("高");

    // 6. 通过「+」上传文本文件并发送消息，校验附件展示与持久化
    const fileInput = host.querySelector<HTMLInputElement>(".hidden-file-input")!;
    const sampleFile = new File(["console.log('hi')"], "demo.ts", { type: "text/plain" });
    Object.defineProperty(fileInput, "files", { value: [sampleFile], configurable: true });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      const chip = host.querySelector<HTMLElement>('.attachment-strip .att-chip[title="demo.ts"]');
      expect(chip).not.toBeNull();
      expect(chip?.textContent?.trim()).toBe("");
      expect(chip?.querySelector(".att-remove")).not.toBeNull();
    });

    const composer = host.querySelector<HTMLTextAreaElement>(".composer-input")!;
    setInputValue(composer, "帮我写个示例");
    await nextTick();
    host.querySelector<HTMLButtonElement>(".composer-right .send-circle")!.click();

    await vi.waitFor(() => {
      expect(host.querySelector(".ai-md")?.textContent).toContain("这是测试回复");
    });
    expect(host.querySelector(".user-att-file")?.textContent).toContain("demo.ts");

    expect(host.querySelector(".ai-sidebar .search-input")).toBeNull();
    expect(host.querySelector(".chat-scroll .chat-title")?.textContent).toContain("帮我写个示例");
    expect(host.querySelector(".chat-scroll .chat-time")?.textContent?.trim()).toBeTruthy();

    // 7. 验证固定会话区与普通会话区、文件夹增删改折叠、在文件夹下新增会话及直接删除会话
    const sections = host.querySelectorAll<HTMLElement>(".chat-section");
    expect(sections.length).toBe(2);
    expect(sections[0].querySelector(".section-title")?.textContent?.trim()).toBe("固定会话");
    expect(sections[1].querySelector(".section-title")?.textContent?.trim()).toBe("普通会话");

    // 在固定会话区新建一个文件夹并命名为「工作」
    sections[0].querySelector<HTMLButtonElement>(".head-btn")!.click();
    await nextTick();
    const folderInput = sections[0].querySelector<HTMLInputElement>(".folder-rename .rename-input")!;
    setInputValue(folderInput, "工作");
    folderInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await nextTick();
    expect(sections[0].querySelector(".folder-name")?.textContent?.trim()).toBe("工作");

    // 在「工作」文件夹下新增会话，应立即出现在该文件夹下
    sections[0].querySelector<HTMLButtonElement>('[aria-label="在该文件夹下新增会话"]')!.click();
    await vi.waitFor(() => {
      expect(sections[0].querySelectorAll(".folder-children .chat-row").length).toBe(1);
    });

    // 折叠并重新展开文件夹（使用平滑折叠容器）
    sections[0].querySelector<HTMLButtonElement>(".folder-toggle")!.click();
    await nextTick();
    expect(sections[0].querySelector(".folder-fold")?.classList.contains("is-collapsed")).toBe(true);
    sections[0].querySelector<HTMLButtonElement>(".folder-toggle")!.click();
    await nextTick();
    expect(sections[0].querySelector(".folder-fold")?.classList.contains("is-collapsed")).toBe(false);
    expect(sections[0].querySelectorAll(".folder-children .chat-row").length).toBe(1);

    // 确认已移除独立移动图标，选中会话可直接拖动
    expect(host.querySelector(".move-handle")).toBeNull();
    expect(sections[0].querySelector(".folder-children .chat-row.active .chat-main.draggable")).not.toBeNull();

    // 点击会话的固定图标将其移入固定会话区，点击删除图标直接删除无需二次确认
    const normalRowItem = sections[1].querySelector<HTMLElement>(".chat-row")!;
    normalRowItem.querySelector<HTMLButtonElement>('[aria-label="固定会话"]')!.click();
    await vi.waitFor(() => {
      expect(sections[1].querySelectorAll(".chat-row").length).toBe(0);
      expect(sections[0].querySelectorAll(".chat-row").length).toBe(2);
    });

    // 点击直接删除文件夹下新增的那条会话
    sections[0].querySelector<HTMLButtonElement>('.folder-children [aria-label="删除会话"]')!.click();
    await vi.waitFor(() => {
      expect(sections[0].querySelectorAll(".folder-children .chat-row").length).toBe(0);
    });

    // 删除文件夹
    sections[0].querySelector<HTMLButtonElement>('[aria-label="删除文件夹"]')!.click();
    await vi.waitFor(() => {
      expect(sections[0].querySelector(".folder-block")).toBeNull();
    });

    expect(localStorage.getItem("open-tools:ai:config")).toContain("sk-multi-key");
    expect(localStorage.getItem("open-tools:ai:config")).toContain("翻译助手");
  } finally {
    app.unmount();
    host.remove();
  }
});

test("助手消息按时间线交错渲染思考过程、文本与工具调用，并支持过程外层总折叠", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const app = createApp(AiMessageItem, {
    streaming: false,
    message: {
      id: "m-interleaved",
      role: "assistant",
      content: "正在检查…\n\n已完成检查。",
      createdAt: Date.now(),
      parts: [
        { id: "p1", type: "reasoning", text: "先查一下状态" },
        { id: "p2", type: "text", text: "正在检查…" },
        { id: "p2b", type: "reasoning", text: "准备调工具" },
        {
          id: "p3",
          type: "tool",
          call: {
            id: "c1",
            serverId: "s1",
            serverName: "本地 MCP",
            toolName: "run_check",
            argumentsText: '{"target":"all"}',
            resultText: "ok",
            status: "done",
          },
        },
        { id: "p4", type: "text", text: "已完成检查。" },
      ],
    },
  }).use(i18n);
  app.mount(host);
  try {
    const children = Array.from(host.querySelectorAll(".assistant-wrap > :not(footer)"));
    expect(children.map((el) => el.className)).toEqual([
      "reasoning-block",
      "ai-md",
      "process-group",
      "ai-md",
    ]);
    expect(children[1].textContent).toContain("正在检查");
    expect(children[2].querySelector(".process-toggle")?.textContent).toContain("已思考并调用 1 个工具");
    // 完成后默认收起，点击可展开查看内部的思考与工具调用
    const groupFold = children[2].querySelector(".fold-panel")!;
    expect(groupFold.classList.contains("open")).toBe(false);
    children[2].querySelector<HTMLButtonElement>(".process-toggle")!.click();
    await nextTick();
    expect(groupFold.classList.contains("open")).toBe(true);
    expect(children[2].textContent).toContain("run_check");
    expect(children[3].textContent).toContain("已完成检查");
  } finally {
    app.unmount();
    host.remove();
  }
});
