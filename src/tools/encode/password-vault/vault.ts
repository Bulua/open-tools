import { isTauri } from "@tauri-apps/api/core";
import { t } from "@/locales";

/**
 * 密码本的加密与存储。
 *
 * 用主密码经 PBKDF2-SHA256（60 万次）派生出 AES-256-GCM 密钥，加密整个条目列表。
 * 文件里只有盐、IV 和密文，没有主密码也没有明文；GCM 自带校验，主密码错误或文件被改动都会解密失败。
 * 桌面版存放在安装目录下的 vault.dat（由 Rust 读写），网页版存放在浏览器本地存储。
 */

export interface VaultEntry {
  id: string;
  /** 名称，例如「GitHub」「公司邮箱」 */
  title: string;
  username: string;
  password: string;
  url: string;
  note: string;
  updatedAt: number;
}

/** 解锁后的密钥，保存时用它重新加密 */
export interface VaultSession {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
}

interface VaultFileData {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

export const DEFAULT_ITERATIONS = 600_000;

const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** 新建密码本：生成随机盐，派生密钥 */
export async function createSession(password: string, iterations = DEFAULT_ITERATIONS): Promise<VaultSession> {
  const salt = randomBytes(16);
  return { key: await deriveKey(password, salt, iterations), salt, iterations };
}

/** 加密条目列表，得到要写入文件的文本；每次保存都用新的随机 IV */
export async function encryptVault(session: VaultSession, entries: VaultEntry[]): Promise<string> {
  const iv = randomBytes(12);
  const plain = new TextEncoder().encode(JSON.stringify(entries));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, session.key, plain));
  const file: VaultFileData = {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: session.iterations,
    salt: toBase64(session.salt),
    iv: toBase64(iv),
    data: toBase64(cipher),
  };
  return JSON.stringify(file);
}

/** 用主密码解开密码本；主密码错误或文件损坏时抛出错误 */
export async function decryptVault(text: string, password: string): Promise<{ session: VaultSession; entries: VaultEntry[] }> {
  let file: VaultFileData;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error(t("encode.vaultCorrupt"));
  }
  if (file?.version !== 1 || file.kdf !== "PBKDF2-SHA256") throw new Error(t("encode.vaultFormat"));
  const salt = fromBase64(file.salt);
  const key = await deriveKey(password, salt, file.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(file.iv) }, key, fromBase64(file.data));
  } catch {
    throw new Error(t("encode.wrongMaster"));
  }
  return { session: { key, salt, iterations: file.iterations }, entries: JSON.parse(new TextDecoder().decode(plain)) };
}

// ---------- 存储 ----------

const WEB_KEY = "vault.dat";

/** 读取加密文件；还没有创建密码本时 data 为 null */
export async function loadVaultFile(): Promise<{ path: string; data: string | null }> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("vault_read");
  }
  return { path: t("encode.browserStorage"), data: localStorage.getItem(WEB_KEY) };
}

export async function saveVaultFile(data: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("vault_write", { data });
  }
  localStorage.setItem(WEB_KEY, data);
}

export const newEntry = (): VaultEntry => ({ id: crypto.randomUUID(), title: "", username: "", password: "", url: "", note: "", updatedAt: Date.now() });

/** 按名称、账号、网址、备注搜索，不区分大小写 */
export const matchEntry = (e: VaultEntry, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || [e.title, e.username, e.url, e.note].some((v) => v.toLowerCase().includes(q));
};
