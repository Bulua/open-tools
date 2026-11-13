import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "color": {
        "name": "Color Converter HEX/RGB/HSL",
        "desc": "Convert between color formats, with a color picker"
      }
    },
    "ja": {
      "color": {
        "name": "カラー変換 HEX/RGB/HSL",
        "desc": "色の形式を相互変換、カラーピッカー付き"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "convert": {
        "rgbValues": "RGB 数值",
        "hslValues": "HSL 数值",
        "color": "颜色",
        "openPicker": "点击打开取色板",
        "pickColor": "点击选择颜色",
        "colorInvalid": "无法识别，支持 HEX、RGB、HSL 三种写法",
        "colorHint": "支持 HEX、RGB、HSL，带透明度也可以",
        "colorEmpty": "输入颜色后显示各种格式"
      }
    },
    "en": {
      "convert": {
        "rgbValues": "RGB values",
        "hslValues": "HSL values",
        "color": "Color",
        "openPicker": "Click to open the color picker",
        "pickColor": "Click to choose a color",
        "colorInvalid": "Not recognized. HEX, RGB and HSL are supported",
        "colorHint": "HEX, RGB and HSL are supported, with or without alpha",
        "colorEmpty": "Enter a color to see it in every format"
      }
    },
    "ja": {
      "convert": {
        "rgbValues": "RGB の値",
        "hslValues": "HSL の値",
        "color": "色",
        "openPicker": "クリックしてカラーピッカーを開く",
        "pickColor": "クリックして色を選択",
        "colorInvalid": "認識できません。HEX・RGB・HSL の形式に対応しています",
        "colorHint": "HEX・RGB・HSL に対応、透明度付きも可",
        "colorEmpty": "色を入力すると各形式で表示されます"
      }
    }
  }
});
