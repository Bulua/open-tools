import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "douyin-download": {
        "name": "Douyin Downloader",
        "desc": "Paste a Douyin share link to download watermark-free videos, original photos, live photos, music and covers (desktop app)"
      }
    },
    "ja": {
      "douyin-download": {
        "name": "Douyin ダウンロード",
        "desc": "Douyin の共有リンクを貼り付けて、透かしなしの動画・元画像・Live Photo・BGM・カバーをダウンロード（デスクトップ版）"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "video": {
        "dyEmpty": "请粘贴抖音分享链接或作品链接",
        "dyNotFound": "没有找到抖音作品，请粘贴分享链接（v.douyin.com/…）或作品页面链接",
        "dyDesktopOnly": "抖音需要在程序内打开作品页读取信息，只有桌面版支持",
        "dyNoVideo": "没有找到视频地址，可能是直播回放或已删除的作品",
        "dyNoUrl": "没有可以下载的地址",
        "dyEmptyFile": "下载的内容为空",
        "dyFileName": "抖音_{id}",
        "dlVideoFile": "下载视频",
        "videoNote": "视频{res} · {size}",
        "dlImage": "下载第 {i} / {n} 张",
        "liveSuffix": "实况",
        "imagesNote": "{n} 张图片 · {size}",
        "dlMusic": "下载背景音乐",
        "musicSuffix": "音乐",
        "music": "背景音乐",
        "coverSuffix": "封面",
        "nothingToDownload": "没有需要下载的内容",
        "noDesc": "（没有描述）",
        "dyPlaceholder": "粘贴抖音分享文案或链接（v.douyin.com/…），回车解析；可以连续解析多个",
        "dyPasteTitle": "粘贴剪贴板中的分享链接并解析",
        "wantMedia": "视频 / 图片（无水印）",
        "wantLive": "实况照片附带的视频",
        "wantMusic": "背景音乐",
        "wantDyCover": "封面",
        "dyTip": "视频是抖音提供的无水印原片，图文是无水印原图，画质不会损失。",
        "about": "说明",
        "dyAbout": "解析时程序会在后台打开一次作品页面（看不到窗口），需要几秒钟。偶尔遇到抖音安全验证时，稍等一会儿再试。仅供个人保存使用，请尊重作者的版权，不要去掉水印后再发布他人的作品。",
        "posts": "作品",
        "openingPage": "正在打开作品页读取信息…",
        "dyEmptyHint": "在抖音里点「分享」→「复制链接」，粘贴到上方后回车",
        "dyEmptySub": "支持视频和图文作品；解析过的作品会排在这里，可以预览、逐个下载。",
        "browseImages": "浏览图片",
        "photoPost": "图文 · {n} 张",
        "noWatermark": "无水印 · {res}",
        "browse": "浏览",
        "cantPlay": "无法在线播放（抖音拒绝了播放请求），下载后可以正常观看",
        "prevImage": "上一张（←）",
        "nextImage": "下一张（→）"
      }
    },
    "en": {
      "video": {
        "dyEmpty": "Paste a Douyin share link or post link",
        "dyNotFound": "No Douyin post found. Paste a share link (v.douyin.com/…) or the post page link",
        "dyDesktopOnly": "Douyin needs to open the post page inside the app, so only the desktop app supports it",
        "dyNoVideo": "No video URL found — it may be a live replay or a deleted post",
        "dyNoUrl": "No downloadable URL",
        "dyEmptyFile": "The downloaded content is empty",
        "dyFileName": "douyin_{id}",
        "dlVideoFile": "Downloading video",
        "videoNote": "Video{res} · {size}",
        "dlImage": "Downloading image {i} / {n}",
        "liveSuffix": "live",
        "imagesNote": "{n} images · {size}",
        "dlMusic": "Downloading music",
        "musicSuffix": "music",
        "music": "music",
        "coverSuffix": "cover",
        "nothingToDownload": "Nothing to download",
        "noDesc": "(no description)",
        "dyPlaceholder": "Paste a Douyin share text or link (v.douyin.com/…) and press Enter; you can parse several in a row",
        "dyPasteTitle": "Paste the share link from the clipboard and parse it",
        "wantMedia": "Video / images (no watermark)",
        "wantLive": "Live photo videos",
        "wantMusic": "Background music",
        "wantDyCover": "Cover",
        "dyTip": "Videos are Douyin's watermark-free originals and images are the original pictures, with no quality loss.",
        "about": "About",
        "dyAbout": "Parsing opens the post page once in the background (no visible window) and takes a few seconds. If Douyin asks for a security check, wait a bit and try again. For personal use only — respect the author's copyright and don't republish others' work without the watermark.",
        "posts": "Posts",
        "openingPage": "Opening the post page…",
        "dyEmptyHint": "In Douyin, tap Share → Copy link, paste it above and press Enter",
        "dyEmptySub": "Videos and photo posts are supported; parsed posts are listed here to preview and download one by one.",
        "browseImages": "Browse images",
        "photoPost": "Photos · {n}",
        "noWatermark": "No watermark · {res}",
        "browse": "Browse",
        "cantPlay": "Can't play online (Douyin refused the request); it plays fine once downloaded",
        "prevImage": "Previous (←)",
        "nextImage": "Next (→)"
      }
    },
    "ja": {
      "video": {
        "dyEmpty": "Douyin の共有リンクまたは投稿のリンクを貼り付けてください",
        "dyNotFound": "Douyin の投稿が見つかりません。共有リンク（v.douyin.com/…）または投稿ページのリンクを貼り付けてください",
        "dyDesktopOnly": "Douyin はアプリ内で投稿ページを開いて情報を読み取るため、デスクトップ版でのみ利用できます",
        "dyNoVideo": "動画のアドレスが見つかりません。ライブのアーカイブか削除された投稿の可能性があります",
        "dyNoUrl": "ダウンロードできるアドレスがありません",
        "dyEmptyFile": "ダウンロードした内容が空です",
        "dyFileName": "douyin_{id}",
        "dlVideoFile": "動画をダウンロード中",
        "videoNote": "動画{res} · {size}",
        "dlImage": "{i} / {n} 枚目をダウンロード中",
        "liveSuffix": "Live",
        "imagesNote": "画像 {n} 枚 · {size}",
        "dlMusic": "BGM をダウンロード中",
        "musicSuffix": "BGM",
        "music": "BGM",
        "coverSuffix": "カバー",
        "nothingToDownload": "ダウンロードする内容がありません",
        "noDesc": "（説明なし）",
        "dyPlaceholder": "Douyin の共有テキストまたはリンク（v.douyin.com/…）を貼り付けて Enter で解析。続けて複数解析できます",
        "dyPasteTitle": "クリップボードの共有リンクを貼り付けて解析",
        "wantMedia": "動画 / 画像（透かしなし）",
        "wantLive": "Live Photo の動画",
        "wantMusic": "BGM",
        "wantDyCover": "カバー",
        "dyTip": "動画は Douyin が提供する透かしなしのオリジナル、画像は透かしなしの元画像で、画質は劣化しません。",
        "about": "説明",
        "dyAbout": "解析時にアプリがバックグラウンドで投稿ページを一度開きます（ウィンドウは表示されません）。数秒かかります。Douyin のセキュリティ確認が出た場合は、少し待ってから再試行してください。個人の保存目的でのみ使用し、作者の著作権を尊重して、透かしを消した他人の作品を再投稿しないでください。",
        "posts": "投稿",
        "openingPage": "投稿ページを開いて情報を読み取り中…",
        "dyEmptyHint": "Douyin で「共有」→「リンクをコピー」し、上に貼り付けて Enter を押してください",
        "dyEmptySub": "動画と画像の投稿に対応。解析した投稿はここに並び、プレビューや個別のダウンロードができます。",
        "browseImages": "画像を見る",
        "photoPost": "画像 · {n} 枚",
        "noWatermark": "透かしなし · {res}",
        "browse": "見る",
        "cantPlay": "オンライン再生できません（Douyin に拒否されました）。ダウンロードすれば正常に再生できます",
        "prevImage": "前の画像（←）",
        "nextImage": "次の画像（→）"
      }
    }
  }
});
