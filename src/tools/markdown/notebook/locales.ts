import { defineModuleLocales } from "@/locales/types";

export default defineModuleLocales({
  tools: {
    en: { notebook: { name: "Notebook", desc: "Organize notes in folders and edit Markdown with live formatting in one pane" } },
    ja: { notebook: { name: "ノートブック", desc: "ノートをフォルダーで整理し、Markdown を入力しながら同じ画面で整形できます" } },
  },
  messages: {
    "zh-CN": { markdown: { notebook: {
      directory: "目录", root: "全部笔记", editor: "笔记正文", live: "排版编辑", source: "Markdown 源码", export: "导出 .md",
      rename: "重命名", resizeDirectory: "调整目录宽度", resizeWriting: "调整正文宽度",
      addNote: "新建笔记", addFolder: "新建文件夹", newFolder: "未命名文件夹", untitled: "未命名笔记",
      name: "名称", location: "所在目录", expand: "展开文件夹", collapse: "收起文件夹", confirm: "确定", cancel: "取消", delete: "删除",
      deleteNote: "确定删除「{name}」吗？", deleteFolder: "确定删除「{name}」及其中的所有内容吗？",
      empty: "选择一篇笔记，或新建笔记", folderHint: "选择文件夹中的笔记，或在这里新建笔记",
      placeholder: "开始写笔记。试试输入 # 加空格创建标题。",
      task: "任务完成状态", editFormula: "双击编辑 LaTeX 公式",
      loading: "正在读取笔记…", loadError: "无法读取笔记本", retry: "重试", saving: "保存中…", saved: "已保存", saveError: "保存失败，点击重试",
    } } },
    en: { markdown: { notebook: {
      directory: "Folders", root: "All notes", editor: "Note content", live: "Live editing", source: "Markdown source", export: "Export .md",
      rename: "Rename", resizeDirectory: "Resize folder pane", resizeWriting: "Resize writing area",
      addNote: "New note", addFolder: "New folder", newFolder: "Untitled folder", untitled: "Untitled note",
      name: "Name", location: "Folder", expand: "Expand folder", collapse: "Collapse folder", confirm: "Done", cancel: "Cancel", delete: "Delete",
      deleteNote: "Delete “{name}”?", deleteFolder: "Delete “{name}” and everything in it?",
      empty: "Select a note or create one", folderHint: "Select a note in this folder or create one here",
      placeholder: "Start writing. Type # followed by a space to make a heading.",
      task: "Task completion", editFormula: "Double-click to edit the LaTeX formula",
      loading: "Loading notes…", loadError: "Could not load the notebook", retry: "Try again", saving: "Saving…", saved: "Saved", saveError: "Save failed. Try again",
    } } },
    ja: { markdown: { notebook: {
      directory: "フォルダー", root: "すべてのノート", editor: "ノート本文", live: "整形編集", source: "Markdown ソース", export: ".md を書き出す",
      rename: "名前を変更", resizeDirectory: "フォルダー欄の幅を調整", resizeWriting: "本文の幅を調整",
      addNote: "新規ノート", addFolder: "新規フォルダー", newFolder: "無題のフォルダー", untitled: "無題のノート",
      name: "名前", location: "保存先フォルダー", expand: "フォルダーを展開", collapse: "フォルダーを折りたたむ", confirm: "完了", cancel: "キャンセル", delete: "削除",
      deleteNote: "「{name}」を削除しますか？", deleteFolder: "「{name}」とその中のすべての項目を削除しますか？",
      empty: "ノートを選ぶか、新しく作成してください", folderHint: "このフォルダーのノートを選ぶか、新しく作成してください",
      placeholder: "ここに入力してください。# の後にスペースを入れると見出しになります。",
      task: "タスクの完了状態", editFormula: "ダブルクリックして LaTeX 数式を編集",
      loading: "ノートを読み込み中…", loadError: "ノートブックを読み込めませんでした", retry: "再試行", saving: "保存中…", saved: "保存済み", saveError: "保存できませんでした。再試行",
    } } },
  },
});
