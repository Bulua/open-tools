import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  "tools": {
    "en": {
      "image-stitch": {
        "name": "Image Stitcher",
        "desc": "Combine several images horizontally, vertically or in a grid, or merge phone screenshots into one long screenshot"
      }
    },
    "ja": {
      "image-stitch": {
        "name": "画像の結合",
        "desc": "複数の画像を横・縦・グリッドで 1 枚に結合します。スマホのスクリーンショットを縦長の 1 枚にまとめることもできます"
      }
    }
  },
  "messages": {
    "zh-CN": {
      "image": {
        "stitchName": "拼接图片",
        "vertical": "纵向",
        "horizontal": "横向",
        "grid": "宫格",
        "stitchSettings": "拼接设置",
        "layout": "排列方式",
        "perRow": "每行",
        "perRowUnit": "张",
        "unifyHeight": "统一高度",
        "unifyWidth": "统一宽度",
        "rearrangeTitle": "恢复为之前自动排列的位置",
        "showAll": "全部显示",
        "showAllTitle": "把所有图片放到预览中间，缩放到刚好都能看见",
        "rearrange": "重新排列",
        "freeTip": "画布大小跟随图片自动变化，虚线框是导出范围。拖动图片调整位置，拖动右下角圆点缩放；在空白处拖出方框可以选中多张一起移动。拖动时自动对齐，按住 Alt 不吸附；方向键微调，按住 Shift 一次 10 像素",
        "freeHint": "滚轮放大，按住空格拖动平移；空白处拖出方框可多选",
        "dragToFree": "拖动图片即可自由调整位置，滚轮放大预览",
        "longShot": "长截图",
        "longShotTitle": "把手机上连续滚动截的多张图拼成一张长截图",
        "longTip": "按滚动的先后顺序排好，相邻两张要有一部分内容重叠。会自动去掉重复的内容，顶部状态栏和底部导航栏只保留一份",
        "longUnmatchedTitle": "没找到重叠",
        "longUnmatched": "第 {n} 张已直接接在后面，请检查顺序",
        "longHint": "滚轮放大，拖动平移",
        "spacing": "间距",
        "between": "图片间",
        "padding": "外边距",
        "background": "背景",
        "outputSize": "输出 {w} × {h}",
        "scaledDown": "（图片太大，已自动缩小）",
        "jpgNoAlpha": "JPG 不支持透明，背景会是白色",
        "downloadStitched": "下载拼接图",
        "stitchDropHint": "按添加顺序拼接，之后可以调整顺序；也可以按 Ctrl + V 粘贴截图",
        "moveForward": "前移",
        "moveBack": "后移"
      }
    },
    "en": {
      "image": {
        "stitchName": "stitched",
        "vertical": "Vertical",
        "horizontal": "Horizontal",
        "grid": "Grid",
        "stitchSettings": "Stitch settings",
        "layout": "Layout",
        "perRow": "Per row",
        "perRowUnit": "",
        "unifyHeight": "Same height",
        "unifyWidth": "Same width",
        "rearrangeTitle": "Restore the automatic arrangement",
        "showAll": "Show all",
        "showAllTitle": "Center all images in the preview and zoom so they all fit",
        "rearrange": "Rearrange",
        "freeTip": "The canvas grows and shrinks with the images; the dashed box is what gets exported. Drag images to move them and the bottom-right dot to resize. Drag a box on empty space to select several and move them together. Images snap while dragging (hold Alt to skip); arrow keys nudge, Shift for 10 px",
        "freeHint": "Scroll to zoom, hold Space and drag to pan; drag on empty space to select several",
        "dragToFree": "Drag an image to position it freely; scroll to zoom",
        "longShot": "Long",
        "longShotTitle": "Merge screenshots taken while scrolling on a phone into one long screenshot",
        "longTip": "Put the screenshots in scrolling order; each one should overlap the previous one a little. Repeated content is removed, and the status bar and navigation bar are kept only once",
        "longUnmatchedTitle": "No overlap found",
        "longUnmatched": "Image {n} was simply appended. Check the order",
        "longHint": "Scroll to zoom, drag to pan",
        "spacing": "Spacing",
        "between": "Between",
        "padding": "Padding",
        "background": "Background",
        "outputSize": "Output {w} × {h}",
        "scaledDown": " (too large, scaled down automatically)",
        "jpgNoAlpha": "JPG has no transparency, so the background will be white",
        "downloadStitched": "Download stitched image",
        "stitchDropHint": "Stitched in the order added; you can reorder later. You can also paste a screenshot with Ctrl + V",
        "moveForward": "Move forward",
        "moveBack": "Move back"
      }
    },
    "ja": {
      "image": {
        "stitchName": "結合画像",
        "vertical": "縦",
        "horizontal": "横",
        "grid": "グリッド",
        "stitchSettings": "結合設定",
        "layout": "並べ方",
        "perRow": "1 行あたり",
        "perRowUnit": "枚",
        "unifyHeight": "高さをそろえる",
        "unifyWidth": "幅をそろえる",
        "rearrangeTitle": "自動配置の位置に戻す",
        "showAll": "全体を表示",
        "showAllTitle": "すべての画像をプレビューの中央に置き、全部見える大きさに合わせる",
        "rearrange": "再配置",
        "freeTip": "キャンバスの大きさは画像に合わせて自動で変わり、点線の枠が書き出し範囲です。画像をドラッグして移動、右下の点をドラッグして拡大縮小。空白をドラッグして囲むと複数選択でき、まとめて移動できます。ドラッグ中は自動で整列（Alt で無効）、矢印キーで微調整（Shift で 10 ピクセル）",
        "freeHint": "ホイールで拡大、Space を押しながらドラッグで移動。空白をドラッグで複数選択",
        "dragToFree": "画像をドラッグすると自由に配置できます。ホイールで拡大",
        "longShot": "スクロール",
        "longShotTitle": "スマホでスクロールしながら撮った複数のスクリーンショットを 1 枚の縦長画像にします",
        "longTip": "スクロールした順に並べ、前後の画像が一部重なるようにしてください。重複部分は自動で取り除かれ、上部のステータスバーと下部のナビゲーションバーは 1 つだけ残ります",
        "longUnmatchedTitle": "重なりが見つかりません",
        "longUnmatched": "{n} 枚目はそのままつなげました。順番を確認してください",
        "longHint": "ホイールで拡大、ドラッグで移動",
        "spacing": "間隔",
        "between": "画像の間",
        "padding": "外側の余白",
        "background": "背景",
        "outputSize": "出力 {w} × {h}",
        "scaledDown": "（大きすぎるため自動で縮小）",
        "jpgNoAlpha": "JPG は透明に対応していないため、背景は白になります",
        "downloadStitched": "結合画像をダウンロード",
        "stitchDropHint": "追加した順に結合し、あとで並べ替えできます。Ctrl + V でスクリーンショットも貼り付けられます",
        "moveForward": "前へ",
        "moveBack": "後ろへ"
      }
    }
  }
});
