import { FileCode2, FileJson, FileText, Globe, Image as ImageIcon } from "lucide-vue-next";
import type { AiOutputFile } from "../outputs";

/** 根据输出文件类型与扩展名映射列表/查看器图标 */
export function iconForOutputFile(file: AiOutputFile) {
  if (file.previewKind === "html") return Globe;
  if (file.previewKind === "svg" || file.previewKind === "image") return ImageIcon;
  if (file.ext === "json" || file.ext === "jsonc" || file.ext === "json5") return FileJson;
  if (file.ext === "md" || file.ext === "markdown" || file.ext === "txt") return FileText;
  return FileCode2;
}
