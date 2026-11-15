import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "image-dpi": {
        "name": "Change Image DPI",
        "desc": "Change the DPI stored in JPG and PNG files (e.g. 72, 300) in bulk without touching pixels or quality; shows the original DPI and print size"
      }
    },
    "ja": {
      "image-dpi": {
        "name": "画像の DPI 変更",
        "desc": "JPG・PNG に記録された DPI（72、300 など）をまとめて変更します。ピクセルと画質はそのままで、元の DPI と印刷サイズも確認できます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "image": {
        "dpiSettings": "DPI 设置",
        "dpiTarget": "改为",
        "dpiTip": "只改写文件里记录的 DPI，像素和画质不变。DPI 决定打印尺寸，常见：屏幕 72 / 96，打印 300",
        "dpiDropHint": "支持 JPG、PNG，可多选；也可以按 Ctrl + V 粘贴",
        "dpiUnsupported": "只支持 JPG、PNG 图片",
        "dpiNone": "未记录",
        "dpiPrintSize": "打印 {w} × {h} 厘米",
        "dpiDownloadAll": "下载全部 {n} 张（ZIP）",
        "dpiZip": "DPI {dpi}.zip"
      }
    },
    "en": {
      "image": {
        "dpiSettings": "DPI settings",
        "dpiTarget": "Change to",
        "dpiTip": "Only the DPI stored in the file changes; pixels and quality stay the same. DPI sets the print size: 72 / 96 for screens, 300 for print",
        "dpiDropHint": "JPG and PNG, multiple allowed. You can also paste with Ctrl + V",
        "dpiUnsupported": "Only JPG and PNG images are supported",
        "dpiNone": "Not set",
        "dpiPrintSize": "Prints at {w} × {h} cm",
        "dpiDownloadAll": "Download all {n} (ZIP)",
        "dpiZip": "DPI {dpi}.zip"
      }
    },
    "ja": {
      "image": {
        "dpiSettings": "DPI の設定",
        "dpiTarget": "変更後",
        "dpiTip": "ファイルに記録された DPI だけを書き換え、ピクセルと画質は変わりません。DPI で印刷サイズが決まります（画面 72 / 96、印刷 300）",
        "dpiDropHint": "JPG・PNG に対応、複数選択できます。Ctrl + V で貼り付けもできます",
        "dpiUnsupported": "JPG・PNG 画像のみ対応しています",
        "dpiNone": "記録なし",
        "dpiPrintSize": "印刷 {w} × {h} cm",
        "dpiDownloadAll": "すべての {n} 枚をダウンロード（ZIP）",
        "dpiZip": "DPI {dpi}.zip"
      }
    }
  }
});
