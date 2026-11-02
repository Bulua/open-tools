<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, Lock, Plus, RefreshCw, Search, Trash2 } from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";
import { openExternal } from "@/utils/openExternal";
import { DEFAULT_PASSWORD, generatePassword } from "../password";
import { createSession, decryptVault, encryptVault, loadVaultFile, matchEntry, newEntry, saveVaultFile, type VaultEntry, type VaultSession } from "../vault";

/**
 * 密码本：保存自己录入的账号和密码，用主密码加密后存放在安装目录。
 * 主密码只在内存里用来派生密钥，不保存；5 分钟没有操作自动锁定。
 */
const AUTO_LOCK_MS = 5 * 60 * 1000;

// ---------- 解锁 ----------
const filePath = ref("");
const exists = ref(false);
const loading = ref(true);
const master = ref("");
const confirm = ref("");
const unlocking = ref(false);
const error = ref("");
const session = shallowRef<VaultSession | null>(null);
const entries = ref<VaultEntry[]>([]);

onMounted(async () => {
  try {
    const file = await loadVaultFile();
    filePath.value = file.path;
    exists.value = file.data !== null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

const unlock = async () => {
  error.value = "";
  if (!master.value) return (error.value = "请输入主密码");
  if (!exists.value) {
    if (master.value.length < 6) return (error.value = "主密码至少 6 位");
    if (master.value !== confirm.value) return (error.value = "两次输入的主密码不一致");
  }
  unlocking.value = true;
  try {
    if (exists.value) {
      const file = await loadVaultFile();
      if (file.data === null) throw new Error("密码本文件不见了");
      const opened = await decryptVault(file.data, master.value);
      session.value = opened.session;
      entries.value = opened.entries;
    } else {
      session.value = await createSession(master.value);
      entries.value = [];
      await saveVaultFile(await encryptVault(session.value, []));
      exists.value = true;
    }
    master.value = confirm.value = "";
    selectedId.value = entries.value[0]?.id ?? null;
    draft.value = selected.value ? { ...selected.value } : null;
    touch();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    unlocking.value = false;
  }
};

const lock = () => {
  clearTimeout(idleTimer);
  session.value = null;
  entries.value = [];
  selectedId.value = null;
  draft.value = null;
  showPassword.value = false;
  confirmId.value = null;
  error.value = "";
};

// 没有操作一段时间后自动锁定
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const touch = () => {
  clearTimeout(idleTimer);
  if (session.value) idleTimer = setTimeout(lock, AUTO_LOCK_MS);
};
onBeforeUnmount(() => clearTimeout(idleTimer));

// ---------- 列表 ----------
const query = ref("");
const filtered = computed(() =>
  entries.value.filter((e) => matchEntry(e, query.value)).sort((a, b) => (a.title || "").localeCompare(b.title || "", "zh-Hans-CN")),
);
const selectedId = ref<string | null>(null);
const selected = computed(() => entries.value.find((e) => e.id === selectedId.value) ?? null);

// 正在编辑的副本，保存后才写回列表
const draft = ref<VaultEntry | null>(null);
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== JSON.stringify(selected.value));
const showPassword = ref(false);
// 删除要点两次：第一次点记下要删的条目，按钮变成「确认删除」
const confirmId = ref<string | null>(null);
const saving = ref(false);

const select = async (id: string) => {
  if (dirty.value && !(await save())) return;
  selectedId.value = id;
  draft.value = selected.value ? { ...selected.value } : null;
  showPassword.value = false;
  confirmId.value = null;
};

const add = async () => {
  if (dirty.value && !(await save())) return;
  const entry = newEntry();
  entries.value = [...entries.value, entry];
  selectedId.value = entry.id;
  draft.value = { ...entry };
  showPassword.value = true;
  confirmId.value = null;
};

/** 加密后写入文件，失败时恢复原来的列表 */
const persist = async (next: VaultEntry[]) => {
  if (!session.value) return false;
  saving.value = true;
  error.value = "";
  try {
    await saveVaultFile(await encryptVault(session.value, next));
    entries.value = next;
    return true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    return false;
  } finally {
    saving.value = false;
  }
};

const save = async () => {
  const d = draft.value;
  if (!d) return true;
  if (!d.title.trim()) {
    error.value = "请填写名称";
    return false;
  }
  const updated = { ...d, title: d.title.trim(), updatedAt: Date.now() };
  const ok = await persist(entries.value.map((e) => (e.id === d.id ? updated : e)));
  if (ok) draft.value = { ...updated };
  return ok;
};

const remove = async (id: string) => {
  if (confirmId.value !== id) return (confirmId.value = id);
  if (await persist(entries.value.filter((e) => e.id !== id))) {
    confirmId.value = null;
    if (selectedId.value !== id) return;
    selectedId.value = filtered.value[0]?.id ?? null;
    draft.value = selected.value ? { ...selected.value } : null;
  }
};

const generate = () => {
  if (!draft.value) return;
  draft.value.password = generatePassword(DEFAULT_PASSWORD);
  showPassword.value = true;
};

const userClip = useClipboard();
const passClip = useClipboard();
const formatDate = (t: number) => new Date(t).toLocaleString("zh-CN", { hour12: false });
</script>

<template>
  <div class="vault" @pointerdown="touch" @keydown="touch">
    <!-- 锁定状态：设置或输入主密码 -->
    <section v-if="!session" class="card lock">
      <KeyRound :size="28" class="lock-icon" />
      <template v-if="loading">
        <p class="tip">正在读取…</p>
      </template>
      <form v-else class="lock-form" @submit.prevent="unlock">
        <h2>{{ exists ? "输入主密码解锁" : "设置主密码" }}</h2>
        <input v-model="master" class="field" type="password" autocomplete="off" :placeholder="exists ? '主密码' : '主密码（至少 6 位）'" autofocus />
        <input v-if="!exists" v-model="confirm" class="field" type="password" autocomplete="off" placeholder="再输入一次" />
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn primary full" type="submit" :disabled="unlocking">{{ unlocking ? "请稍候…" : exists ? "解锁" : "创建密码本" }}</button>
        <p v-if="!exists" class="tip warn">主密码用来加密所有内容，不会保存在任何地方。忘记主密码后，密码本无法找回。</p>
        <p v-if="filePath" class="tip path" :title="filePath">保存位置：{{ filePath }}</p>
      </form>
    </section>

    <template v-else>
      <!-- 左：条目列表 -->
      <aside class="card panel">
        <div class="card-title">
          <span class="grow">密码本<span class="count">（{{ entries.length }}）</span></span>
          <button class="btn small subtle" title="锁定密码本" @click="lock"><Lock :size="14" />锁定</button>
        </div>
        <div class="search">
          <Search :size="14" />
          <input v-model="query" placeholder="搜索名称、账号、网址" />
        </div>
        <ul class="rows">
          <li v-for="e in filtered" :key="e.id" class="row" :class="{ on: e.id === selectedId }" @click="select(e.id)">
            <span class="avatar">{{ (e.title || "?").slice(0, 1).toUpperCase() }}</span>
            <span class="info">
              <span class="name">{{ e.title || "未命名" }}</span>
              <span class="user">{{ e.username || "—" }}</span>
            </span>
            <button
              class="row-delete"
              :class="{ confirm: confirmId === e.id }"
              :disabled="saving"
              :title="confirmId === e.id ? '再点一次删除' : '删除'"
              @click.stop="remove(e.id)"
            >
              <template v-if="confirmId === e.id">确认删除</template>
              <Trash2 v-else :size="14" />
            </button>
          </li>
          <li v-if="!filtered.length" class="none">{{ entries.length ? "没有匹配的条目" : "还没有保存任何账号" }}</li>
        </ul>
        <div class="add">
          <button class="btn primary full" @click="add"><Plus :size="14" />新增账号</button>
        </div>
      </aside>

      <!-- 右：编辑 -->
      <section class="card editor">
        <template v-if="draft">
          <div class="card-title">
            <span class="grow">{{ draft.title || "新账号" }}</span>
            <span v-if="selected?.updatedAt" class="updated">更新于 {{ formatDate(selected.updatedAt) }}</span>
            <button class="btn small subtle danger" :disabled="saving" :title="confirmId === draft.id ? '再点一次删除这个账号' : '删除这个账号'" @click="remove(draft.id)">
              <Trash2 :size="14" />{{ confirmId === draft.id ? "确认删除" : "删除" }}
            </button>
          </div>
          <div class="form">
            <label>
              <span>名称</span>
              <input v-model="draft.title" class="field" placeholder="例如 GitHub、公司邮箱" />
            </label>
            <label>
              <span>账号</span>
              <div class="with-actions">
                <input v-model="draft.username" class="field" autocomplete="off" placeholder="用户名、邮箱或手机号" />
                <button class="icon-btn" :class="{ ok: userClip.copied.value }" title="复制账号" @click="userClip.copy(draft.username)">
                  <Check v-if="userClip.copied.value" :size="14" /><Copy v-else :size="14" />
                </button>
              </div>
            </label>
            <label>
              <span>密码</span>
              <div class="with-actions">
                <input v-model="draft.password" class="field mono" :type="showPassword ? 'text' : 'password'" autocomplete="off" />
                <button class="icon-btn" :title="showPassword ? '隐藏' : '显示'" @click="showPassword = !showPassword">
                  <EyeOff v-if="showPassword" :size="14" /><Eye v-else :size="14" />
                </button>
                <button class="icon-btn" title="生成随机密码" @click="generate"><RefreshCw :size="14" /></button>
                <button class="icon-btn" :class="{ ok: passClip.copied.value }" title="复制密码" @click="passClip.copy(draft.password)">
                  <Check v-if="passClip.copied.value" :size="14" /><Copy v-else :size="14" />
                </button>
              </div>
            </label>
            <label>
              <span>网址</span>
              <div class="with-actions">
                <input v-model="draft.url" class="field" placeholder="https://" />
                <button class="icon-btn" title="在浏览器中打开" :disabled="!/^https?:\/\//i.test(draft.url)" @click="openExternal(draft.url)">
                  <ExternalLink :size="14" />
                </button>
              </div>
            </label>
            <label>
              <span>备注</span>
              <textarea v-model="draft.note" class="field note" rows="4" placeholder="密保问题、找回方式等" />
            </label>
          </div>
          <div class="actions">
            <p v-if="error" class="error">{{ error }}</p>
            <span class="grow" />
            <button class="btn primary" :disabled="saving || !dirty" @click="save">{{ saving ? "保存中…" : dirty ? "保存" : "已保存" }}</button>
          </div>
        </template>
        <div v-else class="blank">
          <KeyRound :size="28" />
          <p>选择左侧的账号查看，或新增一个</p>
          <span class="tip path" :title="filePath">已加密保存在：{{ filePath }}</span>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.vault {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  gap: 14px;
}
.grow {
  flex: 1;
  min-width: 0;
}

/* 锁定 */
.lock {
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
}
.lock-icon {
  color: var(--accent);
}
.lock-form {
  width: min(340px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lock-form h2 {
  margin: 0 0 4px;
  text-align: center;
  font-size: 15px;
  font-weight: 500;
}
.lock-form .field {
  height: 36px;
}
.warn {
  line-height: 1.6;
  color: var(--warning);
}
.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 列表 */
/* 窗口较窄时列表先变窄，编辑区保持可用的宽度 */
.panel {
  flex: 0 1 280px;
  min-width: 200px;
  min-height: 0;
}
.count {
  font-weight: 400;
  color: var(--text-3);
}
.search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 10px 4px;
  padding: 0 10px;
  height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text-3);
}
.search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: none;
  font-size: 13px;
  color: var(--text);
}
.rows {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 6px;
  overflow: auto;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.row:hover {
  background: var(--hover);
}
.row.on {
  background: var(--active);
}
.avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}
.info {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.name,
.user {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name {
  font-size: 13px;
}
.user {
  font-size: 12px;
  color: var(--text-3);
}
/* 鼠标移到条目上才显示删除按钮；等待确认时一直显示 */
.row-delete {
  flex-shrink: 0;
  margin-left: auto;
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  display: inline-grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
}
.row:hover .row-delete,
.row-delete.confirm {
  opacity: 1;
}
.row-delete:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.row-delete.confirm {
  background: var(--danger-soft);
  color: var(--danger);
}
.none {
  padding: 24px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
}
.add {
  padding: 10px;
  border-top: 1px solid var(--border);
}

/* 编辑 */
.editor {
  flex: 1;
  min-width: 320px;
}
.updated {
  font-weight: 400;
  color: var(--text-3);
}
.form {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  max-width: 560px;
}
.form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.with-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.with-actions .field {
  flex: 1;
  min-width: 0;
}
.form .field {
  height: 34px;
  font-size: 13px;
}
.form .note {
  height: auto;
  padding: 8px 10px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
.actions .error {
  flex-basis: 100%;
}
.btn.danger:not(:disabled) {
  color: var(--danger);
}
.blank {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-3);
}
.blank p {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}
.blank .path {
  max-width: 100%;
}
</style>
