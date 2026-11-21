# Word 转 Markdown

「Word 转 Markdown」位于 `src/tools/document/word-to-markdown/`，原生实现位于 `src-tauri/src/tools/document/word_to_markdown/`。仅支持 `.docx`，无需安装 Office 或其他转换组件。前端使用二进制 IPC 上传单个 Word 文件，Rust 直接读取 DOCX 的 ZIP/XML，生成主目录中的同名 `.md` 和 `assets/` 图片，再返回内部 ZIP。界面只解压 Markdown 供查看；没有导出图片时直接保存原始 `.md` 字节，有图片时保存包含 Markdown 与 `assets/` 的 ZIP，不上传服务器。图片判断以实际导出的资源为准，表格和原生公式本身不会触发 ZIP 导出。

## 支持的内容

支持标题、段落、直接或继承的粗体/斜体、删除线、列表、链接、图片、表格及常见 OMML 公式。简单表格输出 Markdown，合并单元格和嵌套表格输出 HTML，保留 `colspan` / `rowspan`；原生公式输出 `$...$` / `$$...$$` LaTeX。图表、SmartArt、文本框、旧公式嵌入对象及无法识别的公式静默跳过，不显示兼容性提示。批注、页眉页脚不导出，修订取接受后的正文。外链图片不下载；损坏、加密文件、转换和保存失败仍走统一错误提示。输入上限 64 MB，解压总量上限 128 MB。

不支持旧 `.doc`，不进行 DOC 到 DOCX 转换，也不下载或调用 LibreOffice。

## 实现与验证

职责划分：前端 `WordToMarkdown.vue` 负责交互，`conversion.ts` 负责二进制 IPC、结果解析及 MD/ZIP 格式选择；Rust `commands.rs` 负责命令校验，`converter/package.rs` 负责 DOCX 包和元数据读取，`converter.rs` 负责正文及图片转换，`converter/table.rs` 负责表格，`math.rs` 负责公式，`xml.rs` 负责 XML 公共操作。图片按 SHA-256 去重，避免逐张比较所有已提取图片的内容。

回归测试以实际 ZIP/XML 结构覆盖图片引用、去重、合并表格、公式、多语言文本、列表、修订、路径边界及文件大小限制。

[返回开发指南](../DEVELOPMENT.md)
