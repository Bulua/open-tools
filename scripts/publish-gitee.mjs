// 把 GitHub 上已发布的版本同步到 Gitee Releases，并生成指向 Gitee 下载地址的 latest.json
// 用法：node scripts/publish-gitee.mjs <标签> <素材目录> <输出的 latest.json>
// 素材目录中需要有从 GitHub Release 下载的 latest.json 和安装包；需要环境变量 GITEE_TOKEN
import { request } from "node:https";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const REPO = "bulua/open-tools";
const API = `https://gitee.com/api/v5/repos/${REPO}`;

const [tag, assetDir, output] = process.argv.slice(2);
const token = process.env.GITEE_TOKEN;
if (!tag || !assetDir || !output) throw new Error("用法：node scripts/publish-gitee.mjs <标签> <素材目录> <输出文件>");
if (!token) throw new Error("缺少环境变量 GITEE_TOKEN");

async function api(path, init = {}) {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}access_token=${token}`;
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, data };
}

// 找到或创建同名 Release（重复运行时复用已有的）
async function ensureRelease(notes) {
  const found = await api(`/releases/tags/${encodeURIComponent(tag)}`);
  if (found.ok && found.data?.id) return found.data;
  const form = new URLSearchParams({
    tag_name: tag,
    name: `Open Tools ${tag}`,
    body: notes || "下载 *-setup.exe 安装即可使用。",
    target_commitish: "master",
  });
  const created = await api("/releases", { method: "POST", body: form });
  if (!created.ok) throw new Error(`创建 Gitee Release 失败（${created.status}）：${JSON.stringify(created.data)}`);
  return created.data;
}

/**
 * 上传文件（multipart）。不用 fetch：Gitee 收完大文件后可能过好几分钟才响应，
 * fetch 等响应头最多 5 分钟就会报 HeadersTimeoutError；这里最多等 30 分钟
 */
function upload(path, name, data) {
  const boundary = `----open-tools-${Date.now().toString(16)}`;
  // multipart 规定用 CRLF 换行
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, data, tail]);
  const url = new URL(`${API}${path}?access_token=${token}`);
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length }, timeout: 30 * 60 * 1000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = text;
          }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("上传超时（30 分钟）")));
    req.on("error", reject);
    req.end(body);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 已上传的同名附件 */
async function findAsset(releaseId, name) {
  const list = await api(`/releases/${releaseId}/attach_files?per_page=100`).catch(() => null);
  return list?.ok && Array.isArray(list.data) ? list.data.find((a) => a.name === name) : null;
}

// 上传附件，已存在同名附件时直接使用，返回下载地址。失败时重试；
// 每次重试前先查一下：Gitee 有时响应很慢甚至断开，但文件其实已经传上去了
async function ensureAsset(releaseId, file) {
  const name = basename(file);
  const data = await readFile(file);
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const existing = await findAsset(releaseId, name);
    if (existing) return existing.browser_download_url;
    try {
      const uploaded = await upload(`/releases/${releaseId}/attach_files`, name, data);
      if (uploaded.ok && uploaded.data?.browser_download_url) return uploaded.data.browser_download_url;
      lastError = new Error(`上传 ${name} 失败（${uploaded.status}）：${JSON.stringify(uploaded.data)}`);
    } catch (e) {
      lastError = e;
    }
    console.log(`第 ${attempt} 次上传 ${name} 没有成功：${lastError.message}`);
    if (attempt < 4) await sleep(attempt * 30_000);
  }
  // 最后再查一次
  const existing = await findAsset(releaseId, name);
  if (existing) return existing.browser_download_url;
  throw lastError;
}

const manifest = JSON.parse(await readFile(join(assetDir, "latest.json"), "utf8"));
const release = await ensureRelease(manifest.notes);

// 签名针对文件内容，换下载地址不影响校验
for (const platform of Object.values(manifest.platforms)) {
  const name = decodeURIComponent(basename(new URL(platform.url).pathname));
  platform.url = await ensureAsset(release.id, join(assetDir, name));
  console.log(`已同步 ${name} → ${platform.url}`);
}

// Gitee 上的更新文件已经是更新的版本时（例如两个版本同时打包、这个后完成），不覆盖
const newer = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};
const current = await fetch("https://gitee.com/bulua/open-tools/raw/updater/latest.json")
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);
if (current?.version && newer(String(current.version), String(manifest.version))) {
  console.log(`Gitee 上的更新文件已经是 ${current.version}，比 ${manifest.version} 新，不覆盖`);
  process.exit(0);
}

await writeFile(output, JSON.stringify(manifest, null, 2));
console.log(`已生成 ${output}`);
