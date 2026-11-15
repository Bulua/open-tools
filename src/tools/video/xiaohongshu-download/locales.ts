import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "xiaohongshu-download": {
        "name": "RedNote Downloader",
        "desc": "Paste a RedNote share link to automatically download videos or photos to the app data folder (desktop app)"
      }
    },
    "ja": {
      "xiaohongshu-download": {
        "name": "小紅書ダウンロード",
        "desc": "小紅書の共有リンクから動画や画像を自動判別し、アプリのデータフォルダーに保存（デスクトップ版）"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "video": {
        "xhsNoImages": "未能读取完整的图片地址，请重新复制分享链接后重试",
        "xhsEmpty": "请粘贴小红书分享文案或笔记链接",
        "xhsInvalid": "没有找到小红书笔记，请粘贴 xhslink.com 分享链接或完整笔记链接",
        "xhsUnavailable": "未能读取笔记：可能需要登录或安全验证、作品不可访问，或页面结构已变化。请重新复制分享链接后重试。",
        "xhsNoVideo": "未能找到可下载的视频地址，请重新复制分享链接后重试",
        "xhsInvalidFile": "下载内容不是有效的媒体文件，请重新解析链接后重试",
        "xhsFileName": "小红书_{id}",
        "xhsPlaceholder": "粘贴小红书分享文案或完整链接，回车解析；可以连续解析多个",
        "xhsPasteTitle": "粘贴小红书分享链接并解析",
        "xhsWantVideo": "视频（MP4）",
        "xhsTip": "直接保存平台提供的视频文件，不重新编码；优先选择兼容性较好的 H.264 视频。",
        "xhsAbout": "请使用小红书「分享 → 复制链接」，保留完整链接参数。普通请求失败时，桌面版会在后台打开笔记页读取信息；遇到登录或安全验证时可能无法解析。仅供个人保存，请尊重作者版权。",
        "xhsWebTip": "推荐在桌面版使用；网页版受跨域限制，且无法在后台加载笔记页。",
        "xhsEmptyHint": "在小红书里点「分享」→「复制链接」，粘贴到上方后回车",
        "xhsEmptySub": "支持视频和图文笔记，自动识别内容并下载。",
        "xhsCantPlay": "无法在线播放，平台可能限制了播放请求；可以尝试下载后观看。"
      }
    },
    "en": {
      "video": {
        "xhsNoImages": "Could not read all photo URLs. Copy a fresh share link and try again",
        "xhsEmpty": "Paste a Xiaohongshu / RedNote share message or post link",
        "xhsInvalid": "No RedNote post found. Paste an xhslink.com share link or a full post URL",
        "xhsUnavailable": "Could not read the post. It may require sign-in or verification, be unavailable, or the page may have changed. Copy a fresh share link and try again.",
        "xhsNoVideo": "No downloadable video found. Copy a fresh share link and try again",
        "xhsInvalidFile": "The download is not a valid media file. Parse the link again and retry",
        "xhsFileName": "RedNote_{id}",
        "xhsPlaceholder": "Paste a RedNote share message or full URL and press Enter; add multiple posts one by one",
        "xhsPasteTitle": "Paste and parse a RedNote share link",
        "xhsWantVideo": "Video (MP4)",
        "xhsTip": "Saves the video supplied by the platform without re-encoding; prefers H.264 for compatibility.",
        "xhsAbout": "Use Share → Copy link in RedNote and keep all URL parameters. If a direct request fails, the desktop app loads the post in the background. Sign-in or security checks may prevent parsing. For personal use; respect the creator's copyright.",
        "xhsWebTip": "The desktop app is recommended. The web version has cross-origin restrictions and cannot load posts in a background window.",
        "xhsEmptyHint": "In RedNote, choose Share → Copy link, paste above and press Enter",
        "xhsEmptySub": "Supports video and photo posts, with automatic content detection and download.",
        "xhsCantPlay": "Online playback failed. The platform may restrict playback requests; try downloading the video to watch it."
      }
    },
    "ja": {
      "video": {
        "xhsNoImages": "すべての画像 URL を取得できません。共有リンクをコピーし直してください",
        "xhsEmpty": "小紅書の共有テキストまたは投稿リンクを貼り付けてください",
        "xhsInvalid": "小紅書の投稿が見つかりません。xhslink.com の共有リンクまたは完全な投稿 URL を貼り付けてください",
        "xhsUnavailable": "投稿を読み取れませんでした。ログインや認証が必要、投稿が閲覧不可、またはページが変更された可能性があります。共有リンクをコピーし直してください。",
        "xhsNoVideo": "ダウンロード可能な動画が見つかりません。共有リンクをコピーし直してください",
        "xhsInvalidFile": "ダウンロードした内容は有効なメディアではありません。リンクを再解析してください",
        "xhsFileName": "小紅書_{id}",
        "xhsPlaceholder": "小紅書の共有テキストまたは完全な URL を貼り付けて Enter。続けて複数の投稿を追加できます",
        "xhsPasteTitle": "小紅書の共有リンクを貼り付けて解析",
        "xhsWantVideo": "動画（MP4）",
        "xhsTip": "プラットフォームが提供する動画を再エンコードせず保存します。互換性の高い H.264 を優先します。",
        "xhsAbout": "小紅書の「共有 → リンクをコピー」を使い、URL のパラメーターを残してください。直接取得できない場合、デスクトップ版はバックグラウンドで投稿を読み込みます。ログインや認証により解析できない場合があります。個人利用に限り、著作権を尊重してください。",
        "xhsWebTip": "デスクトップ版を推奨します。ウェブ版にはクロスオリジン制限があり、バックグラウンドで投稿を開けません。",
        "xhsEmptyHint": "小紅書で「共有 → リンクをコピー」を選び、上に貼り付けて Enter",
        "xhsEmptySub": "動画と画像の投稿を自動判別してダウンロードします。",
        "xhsCantPlay": "オンライン再生ができません。再生リクエストが制限されている可能性があります。ダウンロードして視聴してください。"
      }
    }
  }
});
