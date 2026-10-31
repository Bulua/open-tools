/** 哈希计算：MD5 与 SHA 系列，不依赖界面，便于测试 */
import SparkMD5 from "spark-md5";

export const HASH_ALGORITHMS = ["MD5", "SHA-1", "SHA-256", "SHA-512"] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** 一次算出所有算法的结果（十六进制小写） */
export async function hashBytes(bytes: Uint8Array): Promise<Record<HashAlgorithm, string>> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const [sha1, sha256, sha512] = await Promise.all(
    (["SHA-1", "SHA-256", "SHA-512"] as const).map((a) => crypto.subtle.digest(a, buffer)),
  );
  return {
    MD5: SparkMD5.ArrayBuffer.hash(buffer),
    "SHA-1": toHex(sha1),
    "SHA-256": toHex(sha256),
    "SHA-512": toHex(sha512),
  };
}

export const hashText = (text: string) => hashBytes(new TextEncoder().encode(text));
