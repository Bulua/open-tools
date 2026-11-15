import type { SocialDownloadAdapter } from "../shared/socialDownload";
import { douyinBaseName, downloadFirst, getDouyinItem, imageExt } from "./douyin";

export const douyinAdapter: SocialDownloadAdapter = {
  platform: "douyin",
  previewThroughHttp: false,
  parse: getDouyinItem,
  baseName: douyinBaseName,
  imageExt,
  download: async (urls, _kind, onProgress, signal) => (await downloadFirst(urls, onProgress, signal)).data,
};
