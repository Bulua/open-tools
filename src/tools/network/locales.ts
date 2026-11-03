import { defineModuleLocales } from "@/locales/types";

/** 网络模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    "http-client": {
      name: "HTTP Client",
      desc: "Send GET, POST or any request with headers, auth, JSON, forms and file uploads; preview JSON, web pages, images, audio, video and PDF responses, or save them to a file",
    },
    "ip-lookup": { name: "IP Address & Location", desc: "See your public IP, region, coordinates and ISP, or look up any IP" },
    ping: { name: "Ping", desc: "Test latency and packet loss to an address" },
    headers: { name: "Headers to JSON / cURL", desc: "Turn request headers copied from the browser or a cURL command into JSON, cURL, fetch or Python code" },
  },
});
