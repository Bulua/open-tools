/**
 * 文档模块前后端通信类型定义。
 */

export interface SystemFont {
  id: number;
  family: string;
  name: string;
  aliases: string[];
  postscriptNames?: string[];
  weight?: number;
  bold: boolean;
  italic: boolean;
}
