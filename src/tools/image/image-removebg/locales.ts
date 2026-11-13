import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "image-removebg": {
        "name": "Background Remover",
        "desc": "AI finds the subject (people, products…) and removes the background; click leftovers to erase them; fill with white, blue, red and more"
      }
    },
    "ja": {
      "image-removebg": {
        "name": "背景除去",
        "desc": "AI が人物や商品などの被写体を判別して背景を除去します。残った背景はクリックで消せ、白・青・赤などの背景色にもできます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "image": {
        "segmentFailed": "识别失败：{error}",
        "fillTransparent": "透明",
        "fillWhite": "白",
        "fillBlue": "蓝",
        "fillRed": "红",
        "removebgSuffix": "去背景",
        "aiSubject": "AI 识别主体",
        "aiSwitchTitle": "Logo、签名等纯色背景可以关掉，只按点选的颜色去除",
        "on": "开启",
        "noModel": "先下载一个模型，就能自动识别主体；也可以关掉 AI，只按点选的颜色去除",
        "aiOff": "已关闭，只按点选的颜色去除背景，适合 Logo、签名、截图",
        "pickBg": "点选去除的背景色",
        "clearPicks": "清空点选的颜色",
        "removeColor": "移除这个颜色",
        "pickTip": "在图片上点击残留的背景，就会去掉这种颜色",
        "tolerance": "容差",
        "feather": "柔化",
        "contiguous": "只去除相连的区域",
        "toleranceTip": "容差越大去除越多；主体里有和背景相近的颜色时，保持勾选「只去除相连的区域」",
        "newBg": "新背景",
        "customColor": "自定义颜色",
        "idPhotoTip": "证件照可以直接换成白、蓝、红底",
        "downloadPngTransparent": "下载 PNG（透明背景）",
        "downloadJpg": "下载 JPG",
        "recognizing": "正在识别主体…",
        "removebgHint": "点击残留的背景即可去除，滚轮缩放，按住拖动",
        "removebgDropHint": "自动用 AI 识别主体去除背景，残留的背景点一下即可去掉。也可以按 Ctrl + V 粘贴"
      }
    },
    "en": {
      "image": {
        "segmentFailed": "Recognition failed: {error}",
        "fillTransparent": "Transparent",
        "fillWhite": "White",
        "fillBlue": "Blue",
        "fillRed": "Red",
        "removebgSuffix": "no-bg",
        "aiSubject": "AI subject detection",
        "aiSwitchTitle": "Turn off for solid backgrounds like logos or signatures, and remove only the colors you pick",
        "on": "On",
        "noModel": "Download a model to detect the subject automatically, or turn AI off and remove only the colors you pick",
        "aiOff": "Off — only the colors you pick are removed; good for logos, signatures and screenshots",
        "pickBg": "Pick background colors to remove",
        "clearPicks": "Clear picked colors",
        "removeColor": "Remove this color",
        "pickTip": "Click leftover background on the image to remove that color",
        "tolerance": "Tolerance",
        "feather": "Feather",
        "contiguous": "Only connected areas",
        "toleranceTip": "Higher tolerance removes more. If the subject has colors close to the background, keep “Only connected areas” checked",
        "newBg": "New background",
        "customColor": "Custom color",
        "idPhotoTip": "ID photos can switch straight to a white, blue or red background",
        "downloadPngTransparent": "Download PNG (transparent)",
        "downloadJpg": "Download JPG",
        "recognizing": "Detecting the subject…",
        "removebgHint": "Click leftover background to remove it, scroll to zoom, drag to pan",
        "removebgDropHint": "AI detects the subject and removes the background; click any leftovers to erase them. You can also paste with Ctrl + V"
      }
    },
    "ja": {
      "image": {
        "segmentFailed": "認識に失敗しました：{error}",
        "fillTransparent": "透明",
        "fillWhite": "白",
        "fillBlue": "青",
        "fillRed": "赤",
        "removebgSuffix": "背景除去",
        "aiSubject": "AI 被写体認識",
        "aiSwitchTitle": "ロゴや署名など単色の背景ならオフにして、選んだ色だけを除去できます",
        "on": "オン",
        "noModel": "モデルをダウンロードすると被写体を自動で認識します。AI をオフにして、選んだ色だけで除去することもできます",
        "aiOff": "オフ：選んだ色だけで背景を除去します。ロゴ・署名・スクリーンショット向け",
        "pickBg": "除去する背景色を選択",
        "clearPicks": "選んだ色をクリア",
        "removeColor": "この色を削除",
        "pickTip": "画像上の残った背景をクリックすると、その色が除去されます",
        "tolerance": "許容範囲",
        "feather": "ぼかし幅",
        "contiguous": "つながった範囲だけを除去",
        "toleranceTip": "許容範囲が大きいほど多く除去します。被写体に背景と似た色がある場合は「つながった範囲だけを除去」をオンのままにしてください",
        "newBg": "新しい背景",
        "customColor": "カスタムカラー",
        "idPhotoTip": "証明写真は白・青・赤の背景にすぐ変更できます",
        "downloadPngTransparent": "PNG をダウンロード（透明背景）",
        "downloadJpg": "JPG をダウンロード",
        "recognizing": "被写体を認識中…",
        "removebgHint": "残った背景をクリックで除去、ホイールで拡大縮小、ドラッグで移動",
        "removebgDropHint": "AI が被写体を認識して背景を除去します。残った背景はクリックで消せます。Ctrl + V で貼り付けもできます"
      }
    }
  }
});
