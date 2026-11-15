import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "ico": {
        "name": "ICO Icon Generator",
        "desc": "Turn an image into a multi-size ICO icon (website favicon, app icon)"
      }
    },
    "ja": {
      "ico": {
        "name": "ICO アイコン生成",
        "desc": "画像から複数サイズの ICO アイコン（Web サイトのファビコン、アプリのアイコン）を作成します"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "image": {
        "original": "原图",
        "sizes": "包含尺寸",
        "nonSquare": "非正方形",
        "contain": "完整显示",
        "cover": "裁切铺满",
        "icoHint": "建议使用 256 × 256 以上的正方形 PNG；也可以按 Ctrl + V 粘贴",
        "needSize": "请至少选择一个尺寸",
        "icoSize": "ICO 文件 {size}",
        "downloadPng": "下载 PNG",
        "zipSuffix": "（ZIP）",
        "downloadIco": "下载 ICO"
      }
    },
    "en": {
      "image": {
        "original": "Original",
        "sizes": "Sizes",
        "nonSquare": "Non-square",
        "contain": "Fit",
        "cover": "Fill",
        "icoHint": "A square PNG of 256 × 256 or larger works best; you can also paste with Ctrl + V",
        "needSize": "Choose at least one size",
        "icoSize": "ICO file {size}",
        "downloadPng": "Download PNG",
        "zipSuffix": " (ZIP)",
        "downloadIco": "Download ICO"
      }
    },
    "ja": {
      "image": {
        "original": "元の画像",
        "sizes": "含めるサイズ",
        "nonSquare": "正方形でない場合",
        "contain": "全体を表示",
        "cover": "切り抜いて埋める",
        "icoHint": "256 × 256 以上の正方形の PNG がおすすめです。Ctrl + V で貼り付けもできます",
        "needSize": "サイズを 1 つ以上選んでください",
        "icoSize": "ICO ファイル {size}",
        "downloadPng": "PNG をダウンロード",
        "zipSuffix": "（ZIP）",
        "downloadIco": "ICO をダウンロード"
      }
    }
  }
});
