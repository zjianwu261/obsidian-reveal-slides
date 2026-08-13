export interface GridElement {
  tag: 'grid';
  dimension: [number, number];     // [宽%, 高%]，相对画布
  position: [string, string];      // 已规范化的 [left, top] CSS 值（含 % / calc / px）
  anchor: [string, string];        // 元素自身的回移量 [x, y] → transform: translate()
  style: string;                   // 内联 CSS
  className: string;
  shape: string | null;
  fragment: string | null;
  animate: string | null;
  children: string;                // 内部 HTML 内容（已渲染过的 Markdown）
}

export interface SplitElement {
  tag: 'split';
  even: boolean;
  gap: number;                     // em
  left: number;
  right: number;
  wrap: number | null;
  noMargin: boolean;
  columns: string[];               // 每栏内容
}
