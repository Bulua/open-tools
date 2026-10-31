/**
 * 在后台线程里执行正则匹配。
 * 写得不好的正则（灾难性回溯）可能运行很久，放在后台线程里，主界面不会卡死，超时后直接结束这个线程。
 */
import { runRegex } from "./regex";

self.onmessage = (e: MessageEvent<{ id: number; pattern: string; flags: string; text: string; replacement?: string }>) => {
  const { id, pattern, flags, text, replacement } = e.data;
  self.postMessage({ id, result: runRegex(pattern, flags, text, replacement) });
};
