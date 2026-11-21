import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  tools: {
    en: { "weibo-download": { name: "Weibo Video Downloader", desc: "Download MP4 videos from public Weibo posts, video pages, and short links" } },
    ja: { "weibo-download": { name: "Weibo 動画ダウンロード", desc: "Weibo の公開投稿、動画ページ、短縮リンクから MP4 動画を保存" } },
  },
  messages: {
    "zh-CN": { video: {
      weiboPlaceholder: "粘贴微博分享文案或链接，回车解析",
      weiboPasteTitle: "粘贴微博分享内容并解析",
      weiboEmptyHint: "复制微博视频的分享链接，粘贴到上方后回车",
      weiboEmptySub: "支持公开帖子、视频页和 t.cn 分享短链接。",
      weiboQualityTip: "按微博提供的画质和编码下载 MP4，所选档位不可用时会自动选择可用档位。",
      weiboInvalidLink: "找不到有效的微博帖子、视频页或分享短链接",
      weiboUnavailable: "无法读取微博内容，请确认链接可以公开访问后重试",
      weiboNoVideo: "该微博没有提供可下载的 MP4 视频",
      weiboInvalidFile: "下载内容不是有效的 MP4 文件，请重新解析后重试",
    } },
    en: { video: {
      weiboPlaceholder: "Paste a Weibo link or share text and press Enter",
      weiboPasteTitle: "Paste and parse a Weibo share",
      weiboEmptyHint: "Copy the Weibo video's share link, paste it above, and press Enter",
      weiboEmptySub: "Supports public posts, video pages, and t.cn short links.",
      weiboQualityTip: "Download MP4 at the quality and codec provided by Weibo. Unavailable choices fall back to an available format.",
      weiboInvalidLink: "No valid Weibo post, video page, or short link was found",
      weiboUnavailable: "Could not read this Weibo content. Check that the link is publicly accessible and try again",
      weiboNoVideo: "This Weibo link does not provide a downloadable MP4 video",
      weiboInvalidFile: "The download is not a valid MP4 file. Parse the link again and retry",
    } },
    ja: { video: {
      weiboPlaceholder: "Weibo のリンクまたは共有テキストを貼り付けて Enter",
      weiboPasteTitle: "Weibo の共有内容を貼り付けて解析",
      weiboEmptyHint: "Weibo 動画の共有リンクをコピーし、上に貼り付けて Enter を押してください",
      weiboEmptySub: "公開投稿、動画ページ、t.cn の短縮リンクに対応します。",
      weiboQualityTip: "Weibo が提供する画質とコーデックで MP4 を保存します。指定の形式がない場合は利用可能な形式を選びます。",
      weiboInvalidLink: "有効な Weibo の投稿、動画ページ、または短縮リンクが見つかりません",
      weiboUnavailable: "Weibo の内容を読み込めません。リンクが公開されているか確認して、もう一度お試しください",
      weiboNoVideo: "この Weibo リンクにはダウンロード可能な MP4 動画がありません",
      weiboInvalidFile: "ダウンロードした内容は有効な MP4 ではありません。リンクを解析し直してください",
    } },
  },
});
