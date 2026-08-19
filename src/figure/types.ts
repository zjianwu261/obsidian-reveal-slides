/**
 * ```figure 代码块的声明格式。
 * 与 .claude/skills/slide-figure/scripts/figure.py 保持一致 —— 同一份声明，
 * 插件里渲染（笔记内实时预览）和命令行渲染（脱离 Obsidian 批量出图）结果相同。
 */

export interface FigureTheme {
  /** 主色：重点框描边、强调字 */
  brand: string;
  /** 重点框填充 */
  soft: string;
  /** 普通框描边 */
  line: string;
  /** 箭头、轴线 */
  arrow: string;
  text: string;
  muted: string;
  /** 结论、易错点 */
  accent: string;
  /** 分隔线 */
  rule: string;
  font: string;
  mono: string;
}

export interface FlowRow {
  chip?: string;
  steps?: string[];
  note?: string;
  noteTitle?: string;
  /** 兼容 Python 声明里的下划线写法 */
  note_title?: string;
}

export interface CompareColumn {
  title?: string;
  lines?: string[];
  highlight?: boolean;
}

export interface TimelineNode {
  label?: string;
  sub?: string;
}

export interface FigureSpecBase {
  type: string;
  theme?: Partial<FigureTheme>;
  /**
   * 图里文字的相对大小，默认 1。
   * 图被塞进越窄的 grid，字看起来越小；跟正文并排时把它调到 1.5~1.8 才配得上。
   */
  textScale?: number;
}

export interface FlowSpec extends FigureSpecBase {
  type: 'flow';
  rows: FlowRow[];
}

export interface CompareSpec extends FigureSpecBase {
  type: 'compare';
  columns: CompareColumn[];
}

export interface BitfieldSpec extends FigureSpecBase {
  type: 'bitfield';
  bits: string[];
  name?: string;
  addr?: string;
  meta?: string;
  /** 位名或位号（D 编号），标出本节要讲的位 */
  highlight?: (string | number)[];
  caption?: string;
}

export interface TimelineSpec extends FigureSpecBase {
  type: 'timeline';
  nodes: TimelineNode[];
}

export type FigureSpec = FlowSpec | CompareSpec | BitfieldSpec | TimelineSpec;

export const FIGURE_TYPES = ['flow', 'compare', 'bitfield', 'timeline'] as const;
