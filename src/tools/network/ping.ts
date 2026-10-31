/**
 * 解析系统 ping 命令的输出（中文 / 英文 Windows，以及 Linux / macOS 格式），统计结果。
 * 纯文本处理，便于测试。
 */

export interface PingReply {
  ok: boolean;
  /** 延迟（毫秒） */
  time?: number;
  /** 延迟小于 1ms 时为 true（Windows 显示「时间<1ms」） */
  under1ms?: boolean;
  ttl?: number;
  ip?: string;
  error?: string;
}

/** 只允许域名、IPv4、IPv6 的字符，且不能以 - 开头（防止被当成命令参数） */
export function isValidHost(host: string): boolean {
  const h = host.trim();
  return h.length > 0 && h.length <= 253 && /^[A-Za-z0-9.:-]+$/.test(h) && !h.startsWith("-");
}

export function parsePingOutput(text: string): PingReply {
  const ip =
    /\[([0-9a-f.:]+)\]/i.exec(text)?.[1] ??
    /(?:来自|Reply from|from)\s+([0-9a-f.:]+?)(?:\s+的回复|:)/i.exec(text)?.[1];

  const time = /(?:时间|time)\s*([=<])\s*([\d.]+)\s*ms/i.exec(text);
  if (time) {
    const ttl = /ttl\s*=\s*(\d+)/i.exec(text);
    return {
      ok: true,
      time: Number(time[2]),
      under1ms: time[1] === "<",
      ttl: ttl ? Number(ttl[1]) : undefined,
      ip,
    };
  }

  let error = "无响应";
  if (/找不到主机|could not find host|unknown host|not known|无法解析/i.test(text)) error = "找不到主机，请检查地址";
  else if (/超时|timed out/i.test(text)) error = "请求超时";
  else if (/无法访问|unreachable/i.test(text)) error = "目标不可达";
  else if (/一般故障|general failure/i.test(text)) error = "网络故障，请检查网络连接";
  return { ok: false, ip, error };
}

export interface PingStats {
  sent: number;
  received: number;
  /** 丢包率 0～100 */
  loss: number;
  min?: number;
  max?: number;
  avg?: number;
}

export function pingStats(replies: PingReply[]): PingStats {
  const times = replies.filter((r) => r.ok && r.time !== undefined).map((r) => r.time!);
  const sent = replies.length;
  return {
    sent,
    received: times.length,
    loss: sent ? Math.round(((sent - times.length) / sent) * 100) : 0,
    min: times.length ? Math.min(...times) : undefined,
    max: times.length ? Math.max(...times) : undefined,
    avg: times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : undefined,
  };
}
