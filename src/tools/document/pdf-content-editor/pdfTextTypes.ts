/** 原文以相同字体、字号和颜色的横排文字段为编辑单位。 */
export interface OriginalPdfText {
  id: string;
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  supported: boolean;
  fontName?: string;
  bold?: boolean;
  italic?: boolean;
  /** 首行基线相对于页面顶端的位置。 */
  baseline?: number;
  lineHeight?: number;
  /** 首字文字原点，而非字形包围框左边缘。 */
  originX?: number;
  characterSpacing?: number;
  horizontalScale?: number;
}

export interface EmbeddedPdfFont { name: string; bytes: Uint8Array }
