// 把 GitHub 上已发布的版本同步到 Gitee Releases，并把指向 Gitee 下载地址的 latest.json 写到 updater 分支
// 用法：node scripts/publish-gitee.mjs <标签> <素材目录> [--apk-only]
// --apk-only 只向已有 Release 上传 APK，不读取或修改 Windows 在线更新信息。
// 素材目录中需要有从 GitHub Release 下载的 latest.json 和安装包；需要环境变量 GITEE_TOKEN
// 全程只走 Gitee 的 HTTPS 接口：GitHub 的机器 git push 到 Gitee 经常连接超时
import { request } from "node:https";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const REPO = "bulua/open-tools";
const API = `https://gitee.com/api/v5/repos/${REPO}`;

const BRANCH = "updater";

const [tag, assetDir, mode] = process.argv.slice(2);
const apkOnly = mode === "--apk-only";
const token = process.env.GITEE_TOKEN;
if (!tag || !assetDir) throw new Error("用法：node scripts/publish-gitee.mjs <标签> <素材目录>");
if (!token) throw new Error("缺少环境变量 GITEE_TOKEN");
if (mode && !apkOnly) throw new Error(`未知发布模式：${mode}`);

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

// 上传附件，已存在同名、同样大小的附件时直接使用，返回下载地址。失败时重试；
// 每次重试前先查一下：Gitee 有时响应很慢甚至断开，但文件其实已经传上去了
async function ensureAsset(releaseId, file) {
  const name = basename(file);
  const data = await readFile(file);
  const same = (asset) => asset && asset.size === data.length;
  // 同名但大小不同的附件是同一版本另一次打包留下的（例如标签推送了两次）：
  // 每次打包出的安装包都不完全一样，留着旧文件会和更新文件里的签名对不上，用户更新时校验失败
  const stale = await findAsset(releaseId, name);
  if (stale && !same(stale)) {
    const removed = await api(`/releases/${releaseId}/attach_files/${stale.id}`, { method: "DELETE" });
    if (!removed.ok) throw new Error(`删除旧的 ${name} 失败（${removed.status}）：${JSON.stringify(removed.data)}`);
    console.log(`已删除另一次打包留下的 ${name}（${stale.size} 字节，这次是 ${data.length} 字节）`);
  }
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const existing = await findAsset(releaseId, name);
    if (same(existing)) return existing.browser_download_url;
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
  if (same(existing)) return existing.browser_download_url;
  throw lastError;
}

async function syncApk() {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("APK 标签必须采用 v主版本.次版本.修订版本 格式");
  const name = `OpenTools_${tag.slice(1)}_arm64-v8a.apk`;
  // 提前确认素材存在；不抢先创建 Release，避免与 Windows 发布并发时写入错误标签。
  await readFile(join(assetDir, name));
  for (let attempt = 1; attempt <= 30; attempt++) {
    const found = await api(`/releases/tags/${encodeURIComponent(tag)}`);
    if (found.ok && found.data?.id) {
      const url = await ensureAsset(found.data.id, join(assetDir, name));
      console.log(`已同步 ${name} → ${url}`);
      return;
    }
    if (found.status !== 404) throw new Error(`读取 Gitee Release 失败（${found.status}）`);
    if (attempt < 30) {
      console.log(`等待 Gitee Release 创建（${attempt}/30）`);
      await sleep(30_000);
    }
  }
  throw new Error(`等待 Gitee Release ${tag} 超时，请确认 Windows 的 Gitee 发布已成功`);
}

async function syncWindows() {
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
  // 通过接口写文件，失败时重试（文件不存在时新建，存在时带上 sha 更新）
  async function writeManifest(content) {
    let lastError;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const current = await api(`/contents/latest.json?ref=${BRANCH}`);
        const sha = current.ok && current.data?.sha;
        if (sha) {
          const remote = JSON.parse(Buffer.from(current.data.content, "base64").toString("utf8"));
          if (remote?.version && newer(String(remote.version), String(manifest.version))) {
            console.log(`Gitee 上的更新文件已经是 ${remote.version}，比 ${manifest.version} 新，不覆盖`);
            return;
          }
        }
        const form = new URLSearchParams({
          content: Buffer.from(content).toString("base64"),
          message: `chore: ${tag} 在线更新文件`,
          branch: BRANCH,
        });
        if (sha) form.set("sha", sha);
        const res = await api("/contents/latest.json", { method: sha ? "PUT" : "POST", body: form });
        if (res.ok) {
          console.log(`已更新 Gitee ${BRANCH} 分支的 latest.json → ${manifest.version}`);
          return;
        }
        lastError = new Error(`写入 latest.json 失败（${res.status}）：${JSON.stringify(res.data)}`);
      } catch (e) {
        lastError = e;
      }
      console.log(`第 ${attempt} 次写入 latest.json 没有成功：${lastError.message}`);
      if (attempt < 4) await sleep(attempt * 15_000);
    }
    throw lastError;
  }

  await writeManifest(JSON.stringify(manifest, null, 2));
}

if (apkOnly) await syncApk();
else await syncWindows();
