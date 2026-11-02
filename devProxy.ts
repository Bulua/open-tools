import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Plugin } from "vite";

/**
 * 开发时用的请求转发：网页版的「HTTP 请求」工具把请求发给开发服务器，由它代为发出，
 * 不受浏览器跨域限制，也可以设置 Cookie、Origin 等浏览器不允许设置的请求头。
 * 只在 npm run dev 时生效；桌面版由 Rust 发出请求，不经过这里。
 *
 * 请求：POST /__open_tools_proxy，请求体是要发送的内容；目标地址、方法、请求头等放在 x-ot-* 请求头里。
 * 响应：响应体边下载边返回（大文件也能显示进度）；状态码、响应头等放在 x-ot-* 响应头里。
 */
export const PROXY_PATH = "/__open_tools_proxy";

const read = (req: import("node:http").IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const header = (req: import("node:http").IncomingMessage, name: string) => {
  const v = req.headers[name];
  return decodeURIComponent((Array.isArray(v) ? v[0] : v) ?? "");
};

export function devProxy(): Plugin {
  return {
    name: "open-tools-dev-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(PROXY_PATH, async (req, res) => {
        try {
          const url = header(req, "x-ot-url");
          const method = header(req, "x-ot-method") || "GET";
          const headers = JSON.parse(header(req, "x-ot-headers") || "[]") as [string, string][];
          const timeout = Number(header(req, "x-ot-timeout")) || 30000;
          const body = await read(req);
          const response = await fetch(url, {
            method,
            headers,
            body: method === "GET" || method === "HEAD" || !body.length ? undefined : body,
            redirect: header(req, "x-ot-redirect") === "manual" ? "manual" : "follow",
            signal: AbortSignal.timeout(timeout),
          });
          // 响应头原样带回（多个 Set-Cookie 分开）；Node 已经解压，内容就是解压后的
          const list: [string, string][] = [];
          response.headers.forEach((v, k) => k !== "set-cookie" && list.push([k, v]));
          for (const c of response.headers.getSetCookie()) list.push(["set-cookie", c]);
          res.statusCode = 200;
          res.setHeader("x-ot-status", String(response.status));
          res.setHeader("x-ot-status-text", encodeURIComponent(response.statusText));
          res.setHeader("x-ot-headers", encodeURIComponent(JSON.stringify(list)));
          res.setHeader("x-ot-final-url", encodeURIComponent(response.url));
          res.setHeader("content-type", "application/octet-stream");
          // Node 已经解压，原来的 Content-Length 是压缩后的大小；没有压缩时可以用来显示进度
          const length = response.headers.get("content-length");
          if (length && !response.headers.get("content-encoding")) res.setHeader("x-ot-length", length);
          if (!response.body) return res.end();
          Readable.fromWeb(response.body as NodeReadableStream).on("error", () => res.destroy()).pipe(res);
        } catch (e) {
          const cause = e instanceof Error && e.cause instanceof Error ? `：${e.cause.message}` : "";
          const message = e instanceof Error ? (e.name === "TimeoutError" ? "请求超时" : `${e.message}${cause}`) : String(e);
          res.statusCode = 502;
          res.setHeader("x-ot-error", encodeURIComponent(message));
          res.end();
        }
      });
    },
  };
}
