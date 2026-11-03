// 管理远程图标（branding/icon.json）：发布新图标、切换到历史图标、查看列表。所有用过的图标都留在 branding/icons 里
// 用法：
//   node scripts/branding.mjs list                       查看所有图标，标出正在用的
//   node scripts/branding.mjs add <图片.png> <id> <名称>  加入新图标并切换过去（图片要求正方形、至少 512×512，四角透明）
//   node scripts/branding.mjs use <id>                   切换到历史上的某个图标；用 default 换回程序自带的图标
// 改完后提交并推送 master，打包流程会同步到 Gitee；用户下次打开程序（或开着时 6 小时内）自动换上
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 图标 id 会成为文件名，只允许小写字母、数字和连字符（与 Rust 端一致） */
export const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= 64 && /^[a-z0-9-]+$/.test(id);

/** 加入新图标并设为正在使用；id 已存在时报错，避免覆盖历史 */
export function addIcon(manifest, icon) {
  if (!validId(icon.id)) throw new Error(`id 只能用小写字母、数字和连字符：${icon.id}`);
  if (icon.id === "default") throw new Error("default 是保留的 id，表示程序自带的图标");
  if (manifest.icons.some((i) => i.id === icon.id)) throw new Error(`已经有 id 为 ${icon.id} 的图标了，换一个 id`);
  return { ...manifest, current: icon.id, icons: [...manifest.icons, icon] };
}

/** 切换到某个图标；default 表示程序自带的图标 */
export function useIcon(manifest, id) {
  if (id !== "default" && !manifest.icons.some((i) => i.id === id)) throw new Error(`没有 id 为 ${id} 的图标，可用：${manifest.icons.map((i) => i.id).join("、")}`);
  return { ...manifest, current: id };
}

export function listIcons(manifest) {
  const lines = manifest.icons.map((i) => `${i.id === manifest.current ? "*" : " "} ${i.id.padEnd(20)} ${i.added}  ${i.name}`);
  if (manifest.current === "default" || !manifest.current) lines.push("* default（程序自带的图标）");
  return lines.join("\n");
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, "branding");
  const file = join(dir, "icon.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const [command, ...args] = process.argv.slice(2);
  let next;

  if (command === "list") {
    console.log(listIcons(manifest));
  } else if (command === "use") {
    next = useIcon(manifest, args[0]);
  } else if (command === "add") {
    const [image, id, ...name] = args;
    if (!image || !id || !name.length) throw new Error("用法：node scripts/branding.mjs add <图片.png> <id> <名称>");
    if (!validId(id)) throw new Error(`id 只能用小写字母、数字和连字符：${id}`);
    // 用 tauri icon 生成各尺寸，取其中的 512×512 PNG 和多尺寸 ICO
    const out = await mkdtemp(join(tmpdir(), "open-tools-icon-"));
    try {
      execFileSync("npx", ["tauri", "icon", image, "-o", out], { cwd: root, stdio: "inherit", shell: true });
      const png = join(dir, "icons", `${id}.png`);
      const ico = join(dir, "icons", `${id}.ico`);
      await copyFile(join(out, "icon.png"), png);
      await copyFile(join(out, "icon.ico"), ico);
      next = addIcon(manifest, {
        id,
        name: name.join(" "),
        added: new Date().toISOString().slice(0, 10),
        png: `icons/${id}.png`,
        ico: `icons/${id}.ico`,
        sha256: { png: sha256(await readFile(png)), ico: sha256(await readFile(ico)) },
      });
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  } else {
    throw new Error("用法：node scripts/branding.mjs list | add <图片.png> <id> <名称> | use <id>");
  }

  if (next) {
    await writeFile(file, JSON.stringify(next, null, 2) + "\n");
    console.log(listIcons(next));
    console.log("\n已更新 branding/icon.json，提交并推送 master 后生效");
  }
}
