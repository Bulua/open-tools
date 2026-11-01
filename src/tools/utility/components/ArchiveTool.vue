<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { ChevronRight, Download, File as FileIcon, Folder, FolderOpen, FolderPlus, Plus, Trash2, X } from "lucide-vue-next";
import FileDropZone from "@/components/common/FileDropZone.vue";
import { useStoredRef } from "@/composables/useStoredRef";
import { formatBytes } from "@/utils/format";
import { canSaveToFolder, saveFile, saveToFolder } from "@/utils/saveFile";
import { buildTree, buildZip, readArchive, safeRelativePath, type ArchiveEntry, type TreeNode } from "../archive";

/**
 * 按 mode 注册为两个工具：
 * - compress：把文件或文件夹打包为 ZIP
 * - extract：查看并解压 ZIP、TAR、TGZ、GZ
 */
withDefaults(defineProps<{ mode?: "compress" | "extract" }>(), { mode: "compress" });

// ======================= 压缩 =======================

const level = useStoredRef<0 | 1 | 6 | 9>("archive.level", 6);
const zipName = ref("压缩文件");
const items = shallowRef<{ file: File; path: string }[]>([]);
const packing = ref(false);
const packDone = ref("");
const compressZone = ref<InstanceType<typeof FileDropZone>>();

const LEVELS: { value: 0 | 1 | 6 | 9; label: string; title: string }[] = [
  { value: 0, label: "仅打包", title: "不压缩，速度最快，适合图片、视频等本身已压缩的文件" },
  { value: 1, label: "快速", title: "压缩快，体积稍大" },
  { value: 6, label: "标准", title: "速度和体积的平衡" },
  { value: 9, label: "最小", title: "体积最小，速度最慢" },
];

const addEntries = (entries: { file: File; path: string }[]) => {
  packDone.value = "";
  // 同一路径只保留最新加入的
  const map = new Map(items.value.map((i) => [i.path, i]));
  for (const e of entries) map.set(e.path, e);
  items.value = [...map.values()];
  // 只加了一个文件夹时，用文件夹名作为默认的压缩包名
  const roots = new Set(items.value.map((i) => i.path.split("/")[0]));
  if (roots.size === 1 && items.value[0].path.includes("/")) zipName.value = [...roots][0];
};
const removeItem = (path: string) => (items.value = items.value.filter((i) => i.path !== path));
const totalSize = computed(() => items.value.reduce((s, i) => s + i.file.size, 0));

const pack = async () => {
  packing.value = true;
  packDone.value = "";
  try {
    const files = await Promise.all(items.value.map(async (i) => ({ path: i.path, data: new Uint8Array(await i.file.arrayBuffer()) })));
    const zip = buildZip(files, level.value);
    if (await saveFile(zip, `${zipName.value.trim() || "压缩文件"}.zip`)) {
      packDone.value = `已保存，${formatBytes(totalSize.value)} → ${formatBytes(zip.length)}`;
    }
  } finally {
    packing.value = false;
  }
};

// ======================= 解压 =======================

const archiveName = ref("");
const entries = shallowRef<ArchiveEntry[]>([]);
const readError = ref("");
const extracting = ref(false);
const extractDone = ref("");

const openArchive = async ([file]: File[]) => {
  readError.value = "";
  extractDone.value = "";
  try {
    entries.value = readArchive(file.name, new Uint8Array(await file.arrayBuffer()));
    archiveName.value = file.name;
    expanded.value = new Set(tree.value.filter((n) => n.dir).map((n) => n.path)); // 默认展开第一层
  } catch (e) {
    entries.value = [];
    readError.value = e instanceof Error ? e.message : String(e);
  }
};

const files = computed(() => entries.value.filter((e) => !e.dir));
const tree = computed(() => buildTree(entries.value));
const expanded = ref(new Set<string>());

/** 把目录树按展开状态摊平成行，便于渲染 */
const rows = computed(() => {
  const out: { node: TreeNode; depth: number }[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ node, depth });
      if (node.dir && expanded.value.has(node.path)) walk(node.children, depth + 1);
    }
  };
  walk(tree.value, 0);
  return out;
});
const toggle = (node: TreeNode) => {
  const s = new Set(expanded.value);
  if (s.has(node.path)) s.delete(node.path);
  else s.add(node.path);
  expanded.value = s;
};

const downloadEntry = (node: TreeNode) => {
  const entry = files.value.find((f) => f.path === node.path);
  if (entry) saveFile(entry.data, node.name);
};

const extractAll = async () => {
  extracting.value = true;
  extractDone.value = "";
  try {
    if (canSaveToFolder()) {
      const folder = await saveToFolder(files.value.map((f) => ({ parts: safeRelativePath(f.path), data: f.data })));
      if (folder) extractDone.value = `已解压 ${files.value.length} 个文件到 ${folder}`;
    } else {
      // 浏览器中无法写入文件夹，改为打包成 ZIP 下载
      const zip = buildZip(files.value.map((f) => ({ path: safeRelativePath(f.path).join("/"), data: f.data })), 0);
      await saveFile(zip, `${archiveName.value.replace(/\.(zip|tar|tgz|gz|tar\.gz)$/i, "")}.zip`);
    }
  } catch (e) {
    readError.value = `解压失败：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    extracting.value = false;
  }
};

const closeArchive = () => {
  entries.value = [];
  archiveName.value = "";
  extractDone.value = "";
};
</script>

<template>
  <!-- ======================= 压缩 ======================= -->
  <div v-if="mode === 'compress'" class="archive">
    <aside class="card panel">
      <section class="section">
        <h3>压缩方式</h3>
        <div class="seg fill">
          <button v-for="l in LEVELS" :key="l.value" :class="{ on: level === l.value }" :title="l.title" @click="level = l.value">
            {{ l.label }}
          </button>
        </div>
        <p class="tip">{{ LEVELS.find((l) => l.value === level)?.title }}</p>
      </section>
      <section class="section">
        <h3>压缩包名称</h3>
        <div class="name-row">
          <input v-model="zipName" class="field" spellcheck="false" />
          <span class="ext">.zip</span>
        </div>
      </section>
      <section class="section">
        <button class="btn primary full" :disabled="!items.length || packing" @click="pack">
          <Download :size="14" />{{ packing ? "压缩中…" : "压缩并保存" }}
        </button>
        <p v-if="packDone" class="tip ok">{{ packDone }}</p>
      </section>
    </aside>

    <section class="card list-card">
      <header class="card-title">
        <span class="grow">待压缩{{ items.length ? `（${items.length} 个文件，${formatBytes(totalSize)}）` : "" }}</span>
        <template v-if="items.length">
          <button class="btn small subtle" @click="compressZone?.open()"><Plus :size="14" />文件</button>
          <button class="btn small subtle" @click="compressZone?.openFolder()"><FolderPlus :size="14" />文件夹</button>
          <button class="btn small subtle" @click="items = []"><Trash2 :size="14" />清空</button>
        </template>
      </header>

      <ul v-if="items.length" class="rows">
        <li v-for="i in items" :key="i.path" class="row">
          <FileIcon :size="15" class="row-icon" />
          <span class="name" :title="i.path">{{ i.path }}</span>
          <span class="size">{{ formatBytes(i.file.size) }}</span>
          <button class="icon-btn" title="移除" @click="removeItem(i.path)"><X :size="13" /></button>
        </li>
      </ul>

      <FileDropZone
        ref="compressZone"
        :compact="items.length > 0"
        :class="items.length ? 'more' : 'drop'"
        multiple
        directories
        :paste="false"
        :title="items.length ? '拖入更多文件或文件夹' : '拖入文件或文件夹，或点击选择文件'"
        hint="文件夹会保留里面的目录结构"
        @entries="addEntries"
      >
        <!-- 拖放区本身是按钮，里面不能再放按钮，用 span 代替 -->
        <span v-if="!items.length" class="btn small" role="button" @click.stop="compressZone?.openFolder()">
          <FolderPlus :size="14" />选择文件夹
        </span>
      </FileDropZone>
    </section>
  </div>

  <!-- ======================= 解压 ======================= -->
  <div v-else class="archive">
    <aside class="card panel">
      <section class="section">
        <h3>内容</h3>
        <dl class="info">
          <dt>压缩包</dt>
          <dd :title="archiveName">{{ archiveName || "—" }}</dd>
          <dt>文件</dt>
          <dd>{{ entries.length ? `${files.length} 个` : "—" }}</dd>
          <dt>解压后</dt>
          <dd>{{ entries.length ? formatBytes(files.reduce((s, f) => s + f.size, 0)) : "—" }}</dd>
        </dl>
      </section>
      <section class="section">
        <button class="btn primary full" :disabled="extracting || !entries.length" @click="extractAll">
          <FolderOpen :size="14" />{{ extracting ? "解压中…" : canSaveToFolder() ? "全部解压到文件夹" : "全部下载（ZIP）" }}
        </button>
        <p v-if="extractDone" class="tip ok">{{ extractDone }}</p>
        <p v-else-if="readError" class="tip error">{{ readError }}</p>
        <p v-else class="tip">也可以点列表中每个文件右侧的按钮单独下载</p>
      </section>
    </aside>

    <section class="card list-card">
      <header class="card-title">
        <span class="grow" :title="archiveName">{{ archiveName || "压缩包内容" }}</span>
        <button v-if="entries.length" class="btn small subtle" @click="closeArchive"><X :size="14" />关闭</button>
      </header>
      <!-- 不限制文件类型：拖入不支持的格式时给出明确提示，而不是没有反应 -->
      <FileDropZone
        v-if="!entries.length"
        class="drop"
        :paste="false"
        title="拖入压缩包，或点击选择"
        hint="支持 ZIP、TAR、TGZ（TAR.GZ）、GZ；暂不支持 7z、RAR 和加密的压缩包"
        @files="openArchive"
      >
        <span v-if="readError" class="error">{{ readError }}</span>
      </FileDropZone>
      <ul v-else class="rows tree">
        <li v-for="{ node, depth } in rows" :key="node.path" class="row" :style="{ paddingLeft: `${10 + depth * 18}px` }">
          <button v-if="node.dir" class="caret" :class="{ open: expanded.has(node.path) }" @click="toggle(node)">
            <ChevronRight :size="13" />
          </button>
          <span v-else class="caret-space" />
          <component :is="node.dir ? (expanded.has(node.path) ? FolderOpen : Folder) : FileIcon" :size="15" class="row-icon" :class="{ dir: node.dir }" />
          <span class="name" :title="node.path" @click="node.dir && toggle(node)">{{ node.name }}</span>
          <span class="size">{{ formatBytes(node.size) }}</span>
          <button v-if="!node.dir" class="icon-btn" title="下载这个文件" @click="downloadEntry(node)"><Download :size="13" /></button>
          <span v-else class="caret-space wide" />
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.archive {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
}
.list-card {
  min-height: 320px;
}
.grow {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn.small {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.drop {
  margin: 12px;
}
.more {
  margin: 0 12px 12px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 480px;
  overflow-y: auto;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 6px 0 10px;
  border-radius: 6px;
}
.row:hover {
  background: var(--hover);
}
.row-icon {
  flex-shrink: 0;
  color: var(--text-3);
}
.row-icon.dir {
  color: var(--accent);
}
.name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.size {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.caret {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-3);
  transition: transform 0.12s;
}
.caret.open {
  transform: rotate(90deg);
}
.caret-space {
  width: 18px;
  flex-shrink: 0;
}
.caret-space.wide {
  width: 26px;
}
.tree .name {
  cursor: default;
}

.panel {
  align-self: start;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
}
.section + .section {
  border-top: 1px solid var(--border);
}
h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}
.seg.fill {
  display: flex;
}
.seg.fill button {
  flex: 1;
  padding: 0 4px;
}
.tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
  word-break: break-all;
}
.tip.ok {
  color: var(--success);
}
.tip.error,
.error {
  color: var(--danger);
}
.error {
  margin-top: 8px;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.name-row .field {
  height: 32px;
  font-size: 13px;
}
.ext {
  font-size: 13px;
  color: var(--text-3);
}
.btn.full {
  width: 100%;
  justify-content: center;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.info {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 14px;
  margin: 0;
  font-size: 13px;
}
.info dt {
  color: var(--text-3);
}
.info dd {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
