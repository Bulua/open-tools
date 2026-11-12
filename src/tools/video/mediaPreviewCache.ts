/** 预览使用本机 Blob 地址，避开媒体标签无法设置请求头的问题；缓存限制数量和内存占用。 */
export function createMediaPreviewCache(maxBytes = 32 * 1024 * 1024, maxEntries = 6) {
  const cache = new Map<string, { url: string; size: number }>();
  let bytes = 0;
  const remove = (key: string) => {
    const item = cache.get(key);
    if (!item) return;
    URL.revokeObjectURL(item.url);
    bytes -= item.size;
    cache.delete(key);
  };
  return {
    get(key: string): string | undefined {
      const item = cache.get(key);
      if (!item) return undefined;
      cache.delete(key); cache.set(key, item);
      return item.url;
    },
    put(key: string, data: Uint8Array, mime: string): string {
      remove(key);
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
      cache.set(key, { url, size: data.length });
      bytes += data.length;
      // 单个大视频可在当前预览中播放；加入下一项时会被回收。
      while (cache.size > 1 && (cache.size > maxEntries || bytes > maxBytes)) remove(cache.keys().next().value!);
      return url;
    },
    clear() { for (const key of cache.keys()) remove(key); },
  };
}
