import type { SocialDownloadAdapter } from "../shared/socialDownload";
import { downloadXiaohongshu, getXiaohongshuItem, xiaohongshuBaseName, xiaohongshuCoverExt } from "./xiaohongshu";

export const xiaohongshuAdapter: SocialDownloadAdapter = {
  platform: "xhs",
  previewThroughHttp: true,
  parse: getXiaohongshuItem,
  baseName: xiaohongshuBaseName,
  imageExt: xiaohongshuCoverExt,
  download: (urls, kind, onProgress, signal) => downloadXiaohongshu(urls, kind === "image" ? "cover" : "video", onProgress, signal),
};
