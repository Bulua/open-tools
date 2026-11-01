// 把 GitHub 上已发布的版本同步到 Gitee Releases，并生成指向 Gitee 下载地址的 latest.json
// 用法：node scripts/publish-gitee.mjs <标签> <素材目录> <输出的 latest.json>
// 素材目录中需要有从 GitHub Release 下载的 latest.json 和安装包；需要环境变量 GITEE_TOKEN
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

// 上传附件，已存在同名附件时直接使用，返回下载地址
async function ensureAsset(releaseId, file) {
  const name = basename(file);
  const list = await api(`/releases/${releaseId}/attach_files?per_page=100`);
  const existing = list.ok && Array.isArray(list.data) ? list.data.find((a) => a.name === name) : null;
  if (existing) return existing.browser_download_url;

  const form = new FormData();
  form.append("file", new Blob([await readFile(file)]), name);
  const uploaded = await api(`/releases/${releaseId}/attach_files`, { method: "POST", body: form });
  if (!uploaded.ok) throw new Error(`上传 ${name} 失败（${uploaded.status}）：${JSON.stringify(uploaded.data)}`);
  return uploaded.data.browser_download_url;
}

const manifest = JSON.parse(await readFile(join(assetDir, "latest.json"), "utf8"));
const release = await ensureRelease(manifest.notes);

// 签名针对文件内容，换下载地址不影响校验
for (const platform of Object.values(manifest.platforms)) {
  const name = decodeURIComponent(basename(new URL(platform.url).pathname));
  platform.url = await ensureAsset(release.id, join(assetDir, name));
  console.log(`已同步 ${name} → ${platform.url}`);
}

await writeFile(output, JSON.stringify(manifest, null, 2));
console.log(`已生成 ${output}`);
