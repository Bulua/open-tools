<script setup lang="ts">
import { recordToolUsage } from "@/composables/toolLibrary";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { locale } from "@/locales";
import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, Lock, Plus, RefreshCw, Search, Square, SquareCheck, Trash2, X } from "lucide-vue-next";
import { useClipboard } from "@/composables/useClipboard";
import { openExternal } from "@/utils/openExternal";
import { showError } from "@/utils/errorToast";
import { DEFAULT_PASSWORD, generatePassword } from "../password";
import { writePrivateClipboardText } from "../clipboardHistory";
import { createSession, decryptVault, encryptVault, loadVaultFile, matchEntry, newEntry, saveVaultFile, type VaultEntry, type VaultSession } from "../vault";

/**
 * 密码本：保存自己录入的账号和密码，用主密码加密后存放在安装目录。
 * 主密码只在内存里用来派生密钥，不保存；5 分钟没有操作自动锁定。
 */
const AUTO_LOCK_MS = 5 * 60 * 1000;
const { t } = useI18n();

// ---------- 解锁 ----------
const exists = ref(false);
const loading = ref(true);
const master = ref("");
const confirm = ref("");
const unlocking = ref(false);
/** 解锁表单里的提示（没填密码、两次不一致、密码错误），显示在表单里；读写文件失败在窗口上方提示 */
const error = ref("");
const session = shallowRef<VaultSession | null>(null);
const entries = ref<VaultEntry[]>([]);

onMounted(async () => {
  try {
    const file = await loadVaultFile();
    exists.value = file.data !== null;
  } catch (e) {
    showError(e);
  } finally {
    loading.value = false;
  }
});

const unlock = async () => {
  error.value = "";
  if (!master.value) return (error.value = t("encode.enterMaster"));
  if (!exists.value) {
    if (master.value.length < 6) return (error.value = t("encode.masterTooShort"));
    if (master.value !== confirm.value) return (error.value = t("encode.masterMismatch"));
  }
  unlocking.value = true;
  try {
    if (exists.value) {
      const file = await loadVaultFile();
      if (file.data === null) throw new Error(t("encode.vaultMissing"));
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
  query.value = "";
  editing.value = null;
  revealed.value = new Set();
  picked.value = new Set();
  confirmDelete.value = false;
  error.value = "";
};

// 没有操作一段时间后自动锁定
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const touch = () => {
  clearTimeout(idleTimer);
  if (session.value) idleTimer = setTimeout(lock, AUTO_LOCK_MS);
};
onBeforeUnmount(() => clearTimeout(idleTimer));

// ---------- 卡片 ----------
const query = ref("");
const filtered = computed(() =>
  entries.value.filter((e) => matchEntry(e, query.value)).sort((a, b) => (a.title || "").localeCompare(b.title || "", "zh-Hans-CN")),
);
// 收起的卡片上点了「显示」的条目
const revealed = ref(new Set<string>());
const saving = ref(false);

const grid = ref<HTMLElement | null>(null);
const cardOf = (id: string) => grid.value?.querySelector<HTMLElement>(`[data-id="${id}"]`) ?? null;

const clickCard = (e: VaultEntry, ev: MouseEvent) => {
  if (picking.value) return togglePick(e.id);
  openDialog(e, ev.currentTarget as HTMLElement);
};

const toggleReveal = (id: string) => {
  const next = new Set(revealed.value);
  if (!next.delete(id)) next.add(id);
  revealed.value = next;
};

/** 加密后写入文件，失败时保留原来的列表 */
const persist = async (next: VaultEntry[]) => {
  if (!session.value) return false;
  saving.value = true;
  try {
    await saveVaultFile(await encryptVault(session.value, next));
    entries.value = next;
    return true;
  } catch (e) {
    showError(e);
    return false;
  } finally {
    saving.value = false;
  }
};

// ---------- 新增 / 编辑弹窗 ----------
// 弹窗打开时从卡片（或「新增」按钮）的位置放大到中间，关闭时缩回卡片
const editing = ref<{ draft: VaultEntry; isNew: boolean } | null>(null);
const original = computed(() => (editing.value?.isNew ? null : (entries.value.find((e) => e.id === editing.value?.draft.id) ?? null)));
// 打开弹窗时的内容，用来判断有没有改动
const initial = ref("");
const dirty = computed(() => !!editing.value && JSON.stringify(editing.value.draft) !== initial.value);
const dialogError = ref("");
const showPassword = ref(false);
const confirmRemove = ref(false);
const closing = ref(false);
const overlayEl = ref<HTMLElement | null>(null);
const dialogEl = ref<HTMLElement | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// 先快后慢、不回弹的曲线，停下时很平稳
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * 弹窗缩成卡片时的样子：平移到卡片中心，再从四周裁掉多出来的部分。
 * 用裁剪代替缩放，文字和圆角不会被拉伸；展开后裁剪框留出 48px 给阴影。
 */
const morphFrom = (card: DOMRect, dialog: DOMRect) => {
  const dx = card.left + card.width / 2 - (dialog.left + dialog.width / 2);
  const dy = card.top + card.height / 2 - (dialog.top + dialog.height / 2);
  const ix = (dialog.width - card.width) / 2;
  const iy = (dialog.height - card.height) / 2;
  return { transform: `translate(${dx}px, ${dy}px)`, clipPath: `inset(${iy}px ${ix}px round 10px)` };
};
const MORPH_OPEN = { transform: "none", clipPath: "inset(-48px round 62px)" };

const openDialog = async (entry: VaultEntry | null, origin: HTMLElement | null) => {
  if (closing.value) return;
  editing.value = { draft: entry ? { ...entry } : newEntry(), isNew: !entry };
  initial.value = JSON.stringify(editing.value.draft);
  dialogError.value = "";
  showPassword.value = !entry;
  confirmRemove.value = false;
  await nextTick();
  const dialog = dialogEl.value;
  // 焦点放进弹窗里，Esc 才能关闭
  if (entry) dialog?.focus({ preventScroll: true });
  else titleInput.value?.focus({ preventScroll: true });
  if (!dialog || !origin || reduceMotion()) return;
  const from = morphFrom(origin.getBoundingClientRect(), dialog.getBoundingClientRect());
  overlayEl.value?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: EASE });
  dialog.animate([from, MORPH_OPEN], { duration: 380, easing: EASE });
};

/** 关闭弹窗；target 是要缩回去的卡片，找不到时原地淡出 */
const closeDialog = async (target: HTMLElement | null) => {
  const dialog = dialogEl.value;
  if (!editing.value || closing.value) return;
  if (dialog && !reduceMotion()) {
    closing.value = true;
    target?.scrollIntoView({ block: "nearest" });
    const frames = target
      ? [MORPH_OPEN, morphFrom(target.getBoundingClientRect(), dialog.getBoundingClientRect())]
      : [
          { transform: "none", opacity: 1 },
          { transform: "scale(0.9)", opacity: 0 },
        ];
    overlayEl.value?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: EASE, fill: "forwards" });
    await dialog.animate(frames, { duration: 320, easing: EASE, fill: "forwards" }).finished.catch(() => {});
    closing.value = false;
  }
  editing.value = null;
};

/** 取消：没有改动时点外面或按 Esc 也能关；有改动只能点「取消」放弃 */
const cancel = (force = false) => {
  if (saving.value || (!force && dirty.value)) return;
  const e = editing.value;
  closeDialog(e && !e.isNew ? cardOf(e.draft.id) : null);
};

const save = async () => {
  const e = editing.value;
  if (!e) return;
  const d = e.draft;
  if (!d.title.trim()) return (dialogError.value = t("encode.needTitle"));
  const updated = { ...d, title: d.title.trim(), updatedAt: Date.now() };
  const ok = await persist(e.isNew ? [...entries.value, updated] : entries.value.map((x) => (x.id === d.id ? updated : x)));
  // 保存失败时会在窗口上方提示，这里只清掉之前「没填标题」的提示
  dialogError.value = "";
  if (!ok) return;
  recordToolUsage();
  // 新增的条目可能被搜索过滤掉，清空搜索让它能看到
  if (e.isNew && !matchEntry(updated, query.value)) query.value = "";
  await nextTick();
  closeDialog(cardOf(d.id));
};

const removeEditing = async () => {
  const e = editing.value;
  if (!e) return;
  if (e.isNew) return cancel(true);
  if (!confirmRemove.value) return (confirmRemove.value = true);
  const ok = await persist(entries.value.filter((x) => x.id !== e.draft.id));
  dialogError.value = "";
  if (ok) closeDialog(null);
};

const generate = () => {
  if (!editing.value) return;
  editing.value.draft.password = generatePassword(DEFAULT_PASSWORD);
  showPassword.value = true;
};

const addButton = ref<HTMLElement | null>(null);
const add = () => {
  openDialog(null, addButton.value);
};

// ---------- 删除：勾选卡片右上角的框，再在工具栏点两次删除 ----------
const picked = ref(new Set<string>());
// 有勾选时，点卡片就是勾选 / 取消，不打开弹窗
const picking = computed(() => picked.value.size > 0);
const confirmDelete = ref(false);

const clearPicked = () => {
  picked.value = new Set();
  confirmDelete.value = false;
};
const togglePick = (id: string) => {
  const next = new Set(picked.value);
  if (!next.delete(id)) next.add(id);
  picked.value = next;
  confirmDelete.value = false;
};
const allPicked = computed(() => filtered.value.length > 0 && filtered.value.every((e) => picked.value.has(e.id)));
const pickAll = () => {
  picked.value = allPicked.value ? new Set() : new Set(filtered.value.map((e) => e.id));
  confirmDelete.value = false;
};
const removePicked = async () => {
  if (!picked.value.size) return;
  if (!confirmDelete.value) return (confirmDelete.value = true);
  if (await persist(entries.value.filter((e) => !picked.value.has(e.id)))) clearPicked();
};

// 复制按钮共用一个剪贴板，用 key 区分是哪一个按钮显示对勾
const clip = useClipboard();
const privateClip = useClipboard(writePrivateClipboardText);
const copiedKey = ref("");
const copy = async (key: string, text: string) => {
  const target = key.endsWith(":pass") ? privateClip : clip;
  try {
    await target.copy(text);
    copiedKey.value = key;
  } catch (error) {
    showError(error);
  }
};
const isCopied = (key: string) =>
  copiedKey.value === key && (key.endsWith(":pass") ? privateClip.copied.value : clip.copied.value);

const isUrl = (url: string) => /^https?:\/\//i.test(url);
const formatDate = (ms: number) => new Date(ms).toLocaleString(locale.value, { hour12: false });
</script>

<template>
  <div class="vault" @pointerdown="touch" @keydown="touch">
    <!-- 锁定状态：设置或输入主密码 -->
    <section v-if="!session" class="card lock">
      <KeyRound :size="28" class="lock-icon" />
      <template v-if="loading">
        <p class="tip">{{ t("encode.reading") }}</p>
      </template>
      <form v-else class="lock-form" @submit.prevent="unlock">
        <h2>{{ exists ? t("encode.unlockTitle") : t("encode.setMaster") }}</h2>
        <input v-model="master" class="field" type="password" autocomplete="off" :placeholder="exists ? t('encode.master') : t('encode.masterMin')" autofocus />
        <input v-if="!exists" v-model="confirm" class="field" type="password" autocomplete="off" :placeholder="t('encode.again')" />
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn primary full" type="submit" :disabled="unlocking">{{ unlocking ? t("encode.wait") : exists ? t("encode.unlock") : t("encode.createVault") }}</button>
        <p v-if="!exists" class="tip warn">{{ t("encode.masterWarn") }}</p>
      </form>
    </section>

    <template v-else>
      <!-- 上：搜索、新增、删除 -->
      <div class="toolbar bar">
        <div class="search">
          <Search :size="14" />
          <input v-model="query" :placeholder="t('encode.searchPlaceholder')" />
        </div>
        <button ref="addButton" class="btn primary" @click="add"><Plus :size="14" />{{ t("encode.add") }}</button>
        <button
          class="btn"
          :class="{ 'danger-solid': picking }"
          :disabled="saving || !picking"
          :title="picking ? '' : t('encode.pickFirst')"
          @click="removePicked"
          @blur="confirmDelete = false"
        >
          <Trash2 :size="14" />{{ !picking ? t("encode.delete") : confirmDelete ? t("encode.confirmDeleteN", { n: picked.size }) : t("encode.deleteN", { n: picked.size }) }}
        </button>
        <template v-if="picking">
          <button class="btn subtle" @click="pickAll">{{ allPicked ? t("encode.unselectAll") : t("encode.selectAll") }}</button>
          <button class="btn subtle" @click="clearPicked"><X :size="14" />{{ t("encode.cancelSelect") }}</button>
        </template>
        <span class="spacer" />
        <span class="count">{{ t("encode.accountCount", { n: entries.length }) }}</span>
        <button class="btn subtle" :title="t('encode.lockTitle')" @click="lock"><Lock :size="14" />{{ t("encode.lock") }}</button>
      </div>

      <!-- 下：卡片，显示账号、密码、网址，过长的截断；点击打开编辑弹窗（备注在弹窗里看） -->
      <div ref="grid" class="grid">
        <article
          v-for="e in filtered"
          :key="e.id"
          :data-id="e.id"
          class="card item"
          :class="{ picking, picked: picked.has(e.id), lifted: editing?.draft.id === e.id }"
          @click="clickCard(e, $event)"
        >
          <div class="summary">
            <span class="avatar">{{ (e.title || "?").slice(0, 1).toUpperCase() }}</span>
            <span class="title" :title="e.title">{{ e.title || t("encode.untitled") }}</span>
            <button class="pick" :title="picked.has(e.id) ? t('encode.unpick') : t('encode.pick')" @click.stop="togglePick(e.id)">
              <SquareCheck v-if="picked.has(e.id)" :size="16" /><Square v-else :size="16" />
            </button>
          </div>
          <dl class="fields">
            <dt>{{ t("encode.account") }}</dt>
            <dd>
              <span class="value" :title="e.username">{{ e.username || "—" }}</span>
              <button v-if="e.username" class="icon-btn" :class="{ ok: isCopied(e.id + ':user') }" :title="t('encode.copyAccount')" @click.stop="copy(e.id + ':user', e.username)">
                <Check v-if="isCopied(e.id + ':user')" :size="13" /><Copy v-else :size="13" />
              </button>
            </dd>
            <dt>{{ t("encode.password") }}</dt>
            <dd>
              <span class="value mono">{{ !e.password ? "—" : revealed.has(e.id) ? e.password : "••••••••" }}</span>
              <template v-if="e.password">
                <button class="icon-btn" :title="revealed.has(e.id) ? t('encode.hide') : t('encode.show')" @click.stop="toggleReveal(e.id)">
                  <EyeOff v-if="revealed.has(e.id)" :size="13" /><Eye v-else :size="13" />
                </button>
                <button class="icon-btn" :class="{ ok: isCopied(e.id + ':pass') }" :title="t('encode.copyPassword')" @click.stop="copy(e.id + ':pass', e.password)">
                  <Check v-if="isCopied(e.id + ':pass')" :size="13" /><Copy v-else :size="13" />
                </button>
              </template>
            </dd>
            <dt>{{ t("encode.url") }}</dt>
            <dd>
              <span class="value" :title="e.url">{{ e.url || "—" }}</span>
              <button v-if="isUrl(e.url)" class="icon-btn" :title="t('encode.openInBrowser')" @click.stop="openExternal(e.url)">
                <ExternalLink :size="13" />
              </button>
            </dd>
          </dl>
        </article>

        <div v-if="!filtered.length" class="blank">
          <KeyRound :size="28" />
          <p>{{ entries.length ? t("encode.noMatch") : t("encode.empty") }}</p>
        </div>
      </div>

      <!-- 新增 / 编辑弹窗 -->
      <div v-if="editing" ref="overlayEl" class="overlay" @mousedown.self="cancel()" @keydown.esc="cancel()">
        <form ref="dialogEl" class="dialog" tabindex="-1" role="dialog" :aria-label="editing.isNew ? t('encode.newAccount') : t('encode.editAccount')" @submit.prevent="save">
          <div class="content">
            <header>
              <h2>{{ editing.isNew ? t("encode.newAccount") : editing.draft.title || t("encode.editAccount") }}</h2>
              <span v-if="original" class="updated">{{ t("encode.updatedAt", { time: formatDate(original.updatedAt) }) }}</span>
            </header>
            <div class="form">
              <label>
                <span>{{ t("encode.name") }}</span>
                <input ref="titleInput" v-model="editing.draft.title" class="field" :placeholder="t('encode.namePlaceholder')" />
              </label>
              <label>
                <span>{{ t("encode.url") }}</span>
                <div class="with-actions">
                  <input v-model="editing.draft.url" class="field" placeholder="https://" />
                  <button type="button" class="icon-btn" :title="t('encode.openInBrowser')" :disabled="!isUrl(editing.draft.url)" @click="openExternal(editing.draft.url)">
                    <ExternalLink :size="14" />
                  </button>
                </div>
              </label>
              <label>
                <span>{{ t("encode.account") }}</span>
                <div class="with-actions">
                  <input v-model="editing.draft.username" class="field" autocomplete="off" :placeholder="t('encode.accountPlaceholder')" />
                  <button type="button" class="icon-btn" :class="{ ok: isCopied('edit:user') }" :title="t('encode.copyAccount')" @click="copy('edit:user', editing.draft.username)">
                    <Check v-if="isCopied('edit:user')" :size="14" /><Copy v-else :size="14" />
                  </button>
                </div>
              </label>
              <label>
                <span>{{ t("encode.password") }}</span>
                <div class="with-actions">
                  <input v-model="editing.draft.password" class="field mono" :type="showPassword ? 'text' : 'password'" autocomplete="off" />
                  <button type="button" class="icon-btn" :title="showPassword ? t('encode.hide') : t('encode.show')" @click="showPassword = !showPassword">
                    <EyeOff v-if="showPassword" :size="14" /><Eye v-else :size="14" />
                  </button>
                  <button type="button" class="icon-btn" :title="t('encode.generatePassword')" @click="generate"><RefreshCw :size="14" /></button>
                  <button type="button" class="icon-btn" :class="{ ok: isCopied('edit:pass') }" :title="t('encode.copyPassword')" @click="copy('edit:pass', editing.draft.password)">
                    <Check v-if="isCopied('edit:pass')" :size="14" /><Copy v-else :size="14" />
                  </button>
                </div>
              </label>
              <label class="wide">
                <span>{{ t("encode.note") }}</span>
                <textarea v-model="editing.draft.note" class="field note" rows="4" :placeholder="t('encode.notePlaceholder')" />
              </label>
            </div>
            <p v-if="dialogError" class="error">{{ dialogError }}</p>
            <footer>
              <button
                v-if="!editing.isNew"
                type="button"
                class="btn subtle danger"
                :disabled="saving"
                :title="confirmRemove ? t('encode.confirmRemoveTitle') : t('encode.removeTitle')"
                @click="removeEditing"
                @blur="confirmRemove = false"
              >
                <Trash2 :size="14" />{{ confirmRemove ? t("encode.confirmDelete") : t("encode.delete") }}
              </button>
              <span class="grow" />
              <button type="button" class="btn subtle" :disabled="saving" @click="cancel(true)">{{ t("encode.cancel") }}</button>
              <button type="submit" class="btn primary" :disabled="saving || !dirty">{{ saving ? t("encode.saving") : t("encode.save") }}</button>
            </footer>
          </div>
        </form>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vault {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
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

/* 工具栏 */
.bar {
  flex-shrink: 0;
  gap: 8px;
}
.search {
  flex: 0 1 300px;
  min-width: 160px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-3);
  transition: border-color var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), color var(--dur) var(--ease-out);
}
.search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  color: var(--accent);
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
.count {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}
.btn.danger-solid:not(:disabled) {
  border-color: var(--danger);
  background: var(--danger);
  color: #fff;
}
.btn.danger:not(:disabled) {
  color: var(--danger);
}

/* 卡片网格 */
.grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  /* 卡片设了 overflow: hidden，行高要按内容算，否则卡片多时会被压扁、底部被裁掉 */
  grid-auto-rows: max-content;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  align-content: start;
  gap: 12px;
  padding: 2px;
}
.item {
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.item:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}
.item.picked {
  border-color: var(--danger);
  box-shadow: 0 0 0 2px var(--danger-soft);
}
/* 正在弹窗里编辑的卡片，看起来像是「飞」到了弹窗里 */
.item.lifted {
  visibility: hidden;
}
.avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}
/* 右上角的勾选框 */
.pick {
  flex-shrink: 0;
  margin-left: auto;
  width: 26px;
  height: 26px;
  display: inline-grid;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-3);
}
.pick:hover {
  background: var(--hover);
  color: var(--text);
}
.item.picked .pick {
  color: var(--danger);
}
.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 8px;
}
.fields {
  margin: 0;
  padding: 0 12px 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 2px 10px;
  font-size: 12px;
}
.fields dt {
  color: var(--text-3);
}
.fields dd {
  margin: 0;
  min-width: 0;
  height: 24px;
  display: flex;
  align-items: center;
  gap: 2px;
}
.fields .icon-btn {
  width: 22px;
  height: 22px;
}
.value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}
.value.mono {
  font-family: var(--font-mono);
}
.blank {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 20px;
  color: var(--text-3);
}
.blank p {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}

/* 新增 / 编辑弹窗 */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(20, 20, 19, 0.28);
}
.dialog {
  width: min(600px, calc(100% - 48px));
  max-height: calc(100% - 48px);
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  outline: none;
}
.content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 20px 16px;
}
.dialog header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.dialog h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 400;
}
.updated {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}
.form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px 16px;
  padding: 8px 0;
}
.form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.form .wide {
  grid-column: 1 / -1;
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
.dialog footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
</style>
