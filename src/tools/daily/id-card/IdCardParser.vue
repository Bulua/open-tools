<script setup lang="ts">
import { useToolResult } from "@/composables/useToolUsage";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, Trash2, X } from "lucide-vue-next";
import { idCardApi } from "@/api/id-card";
import { locale } from "@/locales";
import { useClipboard } from "@/composables/useClipboard";
import { showError } from "@/utils/errorToast";
import {
  formatId,
  parseIdCard,
  parseIdCards,
  type Birth,
  type IdChecks,
  type IdInfo,
  type IdParseResult,
} from "./idCard";

/**
 * 身份证号解析：校验号码，列出地区、出生日期、年龄、性别、生肖、星座等能从号码推算出的信息。
 * 解析与行政区划查表由本机 Rust 后端完成，不上传；最近查询的 10 个号码保存在本机，可以逐条删除或清空。
 */
const LEGACY_HISTORY_KEY = "idCard.history";
const { t } = useI18n();
const input = ref("");
const inputEl = ref<HTMLInputElement>();

const parsed = shallowRef<IdParseResult | null>(null);
const info = computed(() => (parsed.value?.ok ? parsed.value.info : null));

let parseSeq = 0;
watch(
  input,
  (raw) => {
    const seq = ++parseSeq;
    if (!raw.trim()) {
      parsed.value = null;
      return;
    }
    void parseIdCard(raw)
      .then((res) => {
        if (seq === parseSeq) parsed.value = res;
      })
      .catch(showError);
  },
  { immediate: true },
);

// ---------- 最近查询 ----------
const history = ref<string[]>([]);

async function loadHistory() {
  try {
    const rows = await idCardApi.listHistory();
    if (rows.length > 0) {
      history.value = rows;
      localStorage.removeItem(LEGACY_HISTORY_KEY);
      return;
    }
    const raw = localStorage.getItem(LEGACY_HISTORY_KEY);
    if (!raw) return;
    const parsedIds = JSON.parse(raw);
    if (Array.isArray(parsedIds) && parsedIds.length > 0) {
      const valid = parsedIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (valid.length > 0) {
        history.value = await idCardApi.importHistory(valid);
      }
    }
    localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch (e) {
    showError(e);
  }
}

onMounted(() => {
  void loadHistory();
});

/** 输入完整的号码停留 1 秒后才记下，避免把改到一半的号码也记进去 */
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => info.value?.id18,
  (id18) => {
    clearTimeout(timer);
    if (id18) {
      timer = setTimeout(() => {
        void idCardApi
          .addHistory(id18)
          .then((rows) => {
            history.value = rows;
          })
          .catch(showError);
      }, 1000);
    }
  },
);
onBeforeUnmount(() => clearTimeout(timer));

const pick = (id: string) => {
  input.value = id;
  inputEl.value?.focus();
};
const removeHistory = (id: string) => {
  void idCardApi
    .deleteHistory(id)
    .then((rows) => {
      history.value = rows;
    })
    .catch(showError);
};
const clearHistory = () => {
  void idCardApi
    .clearHistory()
    .then(() => {
      history.value = [];
    })
    .catch(showError);
};

const historyInfos = shallowRef<Record<string, IdInfo | null>>({});
let historySeq = 0;
watch(
  history,
  (ids) => {
    const seq = ++historySeq;
    if (!ids.length) {
      historyInfos.value = {};
      return;
    }
    void parseIdCards(ids)
      .then((results) => {
        if (seq !== historySeq) return;
        const map: Record<string, IdInfo | null> = {};
        ids.forEach((id, idx) => {
          const r = results[idx];
          map[id] = r?.ok ? r.info : null;
        });
        historyInfos.value = map;
      })
      .catch(showError);
  },
  { immediate: true },
);

/** 历史记录下方的简要说明：地区 · 出生日期 · 性别 */
const historyRows = computed(() =>
  history.value.map((id) => {
    const i = historyInfos.value[id] ?? null;
    const region = i?.region ?? null;
    const summary = [
      region ? [region.province, region.city, region.county].filter(Boolean).join("") : "",
      i?.birth ? dateText(i.birth) : "",
      i?.male == null ? "" : i.male ? t("encode.idMale") : t("encode.idFemale"),
    ].filter(Boolean);
    return { id, text: formatId(id), summary: summary.join(" · ") };
  }),
);

/** 已经能判断且未通过的检查，文案见 encode.idBad_* */
const failed = computed(() => (info.value ? (Object.keys(info.value.checks) as (keyof IdChecks)[]).filter((k) => info.value!.checks[k] === false) : []));

const n = (v: number) => v.toLocaleString(locale.value);
const dateText = (b: Birth, calendar?: string) =>
  new Intl.DateTimeFormat(calendar ? `${locale.value}-u-ca-${calendar}` : locale.value, { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(b.year, b.month - 1, b.day)));
const weekday = (b: Birth) => new Intl.DateTimeFormat(locale.value, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(b.year, b.month - 1, b.day)));

/** 表格的一格：名称、结果，hint 是结果下方的灰色说明；还没输入到的部分 value 为空 */
interface Cell {
  label: string;
  value: string;
  hint?: string;
}

/** 表格一直显示同样的格子，输入了多少位就填上多少 */
const cells = computed<Cell[]>(() => {
  const i = info.value;
  const region = i?.region ?? null;
  const b = i?.birth ?? null;
  const days = i?.daysToBirthday ?? null;
  const checkDigitHint = () => {
    if (!i?.expectedCheckDigit) return "";
    if (i.from15) return t("encode.idCheckDigitAdded");
    if (i.checkDigit === null) return t("encode.idCheckDigitExpected");
    return i.checks.checksum ? t("encode.idCheckDigitOk") : t("encode.idCheckDigitBad", { d: i.expectedCheckDigit });
  };
  return [
    { label: t("encode.idNumber"), value: i?.id18 ?? "", hint: i?.id18 ? (i.from15 ? t("encode.idFrom15Hint") : formatId(i.id18)) : "" },
    {
      label: t("encode.idRegion"),
      value: region ? [region.province, region.city, region.county].filter(Boolean).join(" ") || (region.found === false ? t("encode.idRegionUnknown") : "") : "",
      hint: region?.found === false ? t("encode.idRegionMissing", { code: i!.regionCode }) : region?.found ? i!.regionCode : "",
    },
    { label: t("encode.idProvince"), value: region?.province ?? "", hint: region?.province ? `${i!.regionCode.slice(0, 2)}0000` : "" },
    { label: t("encode.idCity"), value: region?.city ?? "", hint: region?.city ? `${i!.regionCode.slice(0, 4)}00` : "" },
    { label: t("encode.idCounty"), value: region?.county ?? "", hint: region?.county ? i!.regionCode : "" },
    { label: t("encode.idBirth"), value: b ? dateText(b) : "", hint: b ? weekday(b) : "" },
    { label: t("encode.idLunar"), value: b ? dateText(b, "chinese") : "" },
    { label: t("encode.idAge"), value: i?.age != null ? t("encode.idAgeValue", { n: i.age }) : "" },
    { label: t("encode.idDaysLived"), value: i?.daysSince != null ? t("encode.idDaysValue", { n: n(i.daysSince) }) : "" },
    { label: t("encode.idNextBirthday"), value: days != null ? (days === 0 ? t("encode.idBirthdayToday") : t("encode.idBirthdayIn", { n: n(days) })) : "" },
    { label: t("encode.idZodiac"), value: i?.zodiac ? t(`encode.zodiac_${i.zodiac}`) : "" },
    { label: t("encode.idStar"), value: i?.star ? t(`encode.star_${i.star}`) : "" },
    {
      label: t("encode.idGender"),
      value: i?.male == null ? "" : i.male ? t("encode.idMale") : t("encode.idFemale"),
      hint: i?.male == null ? "" : t("encode.idGenderHint", { d: i.sequence[2] }),
    },
    { label: t("encode.idSequence"), value: i?.sequence ?? "" },
    { label: t("encode.idCheckDigit"), value: i?.checkDigit ?? i?.expectedCheckDigit ?? "", hint: checkDigitHint() },
  ];
});

const { copy } = useClipboard();
const copiedLabel = ref<string | null>(null);
const onCopy = async (cell: Cell) => {
  if (!cell.value) return;
  await copy(cell.value);
  copiedLabel.value = cell.label;
  setTimeout(() => (copiedLabel.value = null), 1200);
};

useToolResult(() => parsed.value?.ok ? info.value?.id18 : "");
</script>

<template>
  <div class="id-card">
    <aside class="side">
      <section class="card input-card">
        <div class="card-title">{{ t("encode.idInput") }}</div>
        <div class="body">
          <input
            ref="inputEl"
            v-model="input"
            class="field small-text"
            maxlength="40"
            spellcheck="false"
            autocomplete="off"
            :placeholder="t('encode.idPlaceholder')"
            @keydown.esc="input = ''"
          />
          <div class="status">
            <span v-if="!parsed" class="chip muted">{{ t("encode.idProgress", { n: 0 }) }}</span>
            <template v-else-if="!parsed.ok">
              <span class="chip bad">{{ t("encode.idInvalid") }}</span>
              <span class="reason">{{ t(`encode.idError_${parsed.error}`) }}</span>
            </template>
            <template v-else-if="failed.length">
              <span class="chip bad">{{ t("encode.idInvalid") }}</span>
              <span class="reason">{{ failed.map((k) => t(`encode.idBad_${k}`)).join(t("encode.idSep")) }}</span>
            </template>
            <span v-else-if="!parsed.info.id18" class="chip muted">{{ t("encode.idProgress", { n: parsed.info.digits.length }) }}</span>
            <span v-else class="chip ok">{{ t("encode.idValid") }}</span>
          </div>
          <p class="tip">{{ t("encode.idPrivacy") }}</p>
        </div>
      </section>

      <section class="card history">
        <div class="card-title">
          {{ t("encode.idHistory") }}
          <button v-if="history.length" class="icon-btn push" :title="t('encode.idClearHistory')" @click="clearHistory"><Trash2 :size="14" /></button>
        </div>
        <ul v-if="history.length" class="records">
          <li v-for="row in historyRows" :key="row.id" :class="{ on: row.id === info?.id18 }" @click="pick(row.id)">
            <span class="record">
              <span class="number">{{ row.text }}</span>
              <small v-if="row.summary">{{ row.summary }}</small>
            </span>
            <button class="icon-btn remove" :title="t('encode.idRemoveHistory')" @click.stop="removeHistory(row.id)"><X :size="13" /></button>
          </li>
        </ul>
        <p v-else class="empty">{{ t("encode.idHistoryEmpty") }}</p>
      </section>
    </aside>

    <section class="card result">
      <div class="card-title">{{ t("encode.idInfo") }}</div>
      <div class="grid">
        <div v-for="cell in cells" :key="cell.label" class="cell">
          <span class="label">{{ cell.label }}</span>
          <span class="value">
            <span :class="{ empty: !cell.value }">{{ cell.value || "—" }}</span>
            <small v-if="cell.hint">{{ cell.hint }}</small>
          </span>
          <button v-if="cell.value" class="icon-btn" :class="{ ok: copiedLabel === cell.label }" :title="t('common.copy')" @click="onCopy(cell)">
            <Check v-if="copiedLabel === cell.label" :size="13" />
            <Copy v-else :size="13" />
          </button>
        </div>
      </div>
      <p class="tip">{{ t("encode.idRegionTip") }}</p>
    </section>
  </div>
</template>

<style scoped>
/* 左侧窄栏放输入框和最近查询，右侧放表格 */
.id-card {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}
.side {
  flex: 0 0 300px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.result {
  flex: 1;
  min-width: 0;
  align-self: flex-start;
  max-height: 100%;
  /* 表格比面板宽 1px（最右一列的分隔线要被裁掉），横向不能滚动 */
  overflow-x: hidden;
  overflow-y: auto;
}
.push {
  margin-left: auto;
}
.body .tip {
  margin: 0;
}
.input-card {
  flex-shrink: 0;
}
.history {
  min-height: 0;
}
.records {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
}
.records li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.records li:hover {
  background: var(--hover);
}
.records li.on {
  background: var(--accent-soft);
}
.record {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.record .number {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text);
}
.record small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-3);
}
.records .remove {
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.records li:hover .remove,
.records .remove:focus-visible {
  opacity: 1;
}
.empty {
  margin: 0;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-3);
}
.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}
.field.small-text {
  font-size: 16px;
  letter-spacing: 0.04em;
}
.status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 13px;
}
.reason {
  color: var(--text-2);
}
.chip {
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
}
.chip.ok {
  color: var(--success);
  background: var(--success-soft);
}
.chip.muted {
  color: var(--text-2);
  background: var(--active);
}
.chip.bad {
  color: var(--danger);
  background: var(--danger-soft);
}
/* 表格：宽度够时每行放 3～4 格；每格右侧和下方画分隔线，最右一列的线超出面板被裁掉 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  width: calc(100% + 1px);
}
.cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 6px 8px 14px;
  box-shadow: 1px 0 0 var(--border), 0 1px 0 var(--border);
}
.label {
  flex: 0 0 72px;
  font-size: 12px;
  color: var(--text-3);
}
.value {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  color: var(--text);
  overflow-wrap: anywhere;
}
.value .empty {
  color: var(--text-3);
}
.value small {
  font-size: 11px;
  color: var(--text-3);
}
.cell .icon-btn {
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.cell:hover .icon-btn,
.cell .icon-btn.ok,
.cell .icon-btn:focus-visible {
  opacity: 1;
}
.result .tip {
  margin: 0;
  padding: 10px 16px 12px;
}
</style>
