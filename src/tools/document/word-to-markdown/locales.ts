import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  tools: {
    en: { "word-to-markdown": { name: "Word to Markdown", desc: "Convert Word text, images, tables and equations to Markdown; download as a ZIP when images are included" } },
    ja: { "word-to-markdown": { name: "Word → Markdown", desc: "Word の本文・画像・表・数式を Markdown に変換し、画像がある場合は素材と一緒に ZIP で保存" } },
  },
  messages: {
    "zh-CN": { document: { wordMarkdown: {
      drop: "拖入或选择 Word 文件", hint: "支持 .docx，最大 64 MB",
      file: "Word 文件", replace: "更换文件", convert: "重新转换", converting: "正在转换…",
      download: "下载", downloadMd: "下载 Markdown", downloadZip: "下载 ZIP", saving: "正在保存…", output: "Markdown 内容", ready: "转换完成",
      structure: "没有图片时直接下载 Markdown；有图片时下载 ZIP，内含 Markdown 和 assets 图片文件夹，图片使用相对路径引用。",
      local: "文件仅在本机处理，无需安装 Office 或其他转换组件。",
      browser: "请使用桌面版进行本地 Word 转换。",
      tooLarge: "文件不能超过 64 MB", invalid: "请选择 .docx 文件",
      failed: "Word 转换失败", saveFailed: "文件保存失败",
    } } },
    en: { document: { wordMarkdown: {
      drop: "Drop or choose a Word file", hint: "Supports .docx, up to 64 MB",
      file: "Word file", replace: "Replace file", convert: "Convert again", converting: "Converting…",
      download: "Download", downloadMd: "Download Markdown", downloadZip: "Download ZIP", saving: "Saving…", output: "Markdown content", ready: "Conversion complete",
      structure: "Without images, download a Markdown file. With images, download a ZIP containing the Markdown file and an assets folder linked with relative paths.",
      local: "Files are processed locally. No Office installation or additional conversion components are required.",
      browser: "Use the desktop app to convert Word files locally.",
      tooLarge: "The file must not exceed 64 MB", invalid: "Choose a .docx file",
      failed: "Word conversion failed", saveFailed: "Could not save file",
    } } },
    ja: { document: { wordMarkdown: {
      drop: "Word ファイルをドロップまたは選択", hint: ".docx に対応、最大 64 MB",
      file: "Word ファイル", replace: "ファイルを変更", convert: "再変換", converting: "変換中…",
      download: "ダウンロード", downloadMd: "Markdown をダウンロード", downloadZip: "ZIP をダウンロード", saving: "保存中…", output: "Markdown の内容", ready: "変換完了",
      structure: "画像がない場合は Markdown を直接保存します。画像がある場合は Markdown と assets 画像フォルダーを ZIP にまとめ、相対パスで参照します。",
      local: "ファイルはローカルで処理します。Office や追加の変換コンポーネントのインストールは不要です。",
      browser: "Word のローカル変換にはデスクトップ版を使用してください。",
      tooLarge: "ファイルは 64 MB 以下にしてください", invalid: ".docx ファイルを選択してください",
      failed: "Word の変換に失敗しました", saveFailed: "ファイルを保存できませんでした",
    } } },
  },
});
