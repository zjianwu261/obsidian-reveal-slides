/**
 * <grid> 属性自动补全的纯逻辑（不依赖 obsidian，可单测）。
 * Obsidian 侧的 EditorSuggest 外壳见 src/editor/index.ts。
 */
import { SHAPE_CLIP_PATHS } from '../transformers/shape';

export interface SuggestItem {
  /** 候选显示文本 */
  label: string;
  /** 实际插入的文本（替换 start..cursor 区间） */
  insert: string;
  /** 右侧灰字说明 */
  detail: string;
}

export interface SuggestContext {
  /** 补全区间在行内的起始列（替换 [start, cursor) ） */
  start: number;
  /** 已输入的前缀 */
  query: string;
  /** 过滤后的候选 */
  items: SuggestItem[];
}

/** 属性名候选：boolean 属性插入后不带 ="" */
interface AttributeDef {
  name: string;
  detail: string;
  boolean?: boolean;
  /** 该属性的取值候选 */
  values?: { value: string; detail: string }[];
}

const POSITION_VALUES = [
  { value: 'center', detail: '画布中心' },
  { value: 'top', detail: '顶边居中' },
  { value: 'bottom', detail: '底边居中' },
  { value: 'left', detail: '左边居中' },
  { value: 'right', detail: '右边居中' },
  { value: 'topleft', detail: '左上角' },
  { value: 'topright', detail: '右上角' },
  { value: 'bottomleft', detail: '左下角' },
  { value: 'bottomright', detail: '右下角' },
  { value: '20 25', detail: '数值: 左 20% 上 25%' },
  { value: '-6 -8', detail: '负数: 距右 6% 距下 8%' },
];

const GRID_ATTRIBUTES: AttributeDef[] = [
  { name: 'dim', detail: '宽 高（画布百分比）' },
  {
    name: 'pos',
    detail: '位置：关键字或数值对',
    values: POSITION_VALUES,
  },
  { name: 'style', detail: '内联 CSS，可用 var(--x)' },
  { name: 'class', detail: '附加 HTML class' },
  {
    name: 'shape',
    detail: 'clip-path 图形',
    values: Object.keys(SHAPE_CLIP_PATHS).map((value) => ({ value, detail: '内置图形' })),
  },
  {
    name: 'frag',
    detail: 'reveal.js 逐步显示',
    values: [
      { value: '1', detail: '出现顺序（data-fragment-index）' },
      { value: 'fade-up', detail: 'fragment 动画类' },
    ],
  },
  {
    name: 'animate',
    detail: 'animate.css 动画',
    values: [
      { value: 'fadeIn', detail: 'animate__fadeIn' },
      { value: 'fadeInUp', detail: 'animate__fadeInUp' },
      { value: 'zoomIn', detail: 'animate__zoomIn' },
    ],
  },
];

/** 光标前是否处于未闭合的 <grid 标签内 */
function findOpenTag(lineUpToCursor: string): 'grid' | null {
  return /<grid(?![\w-])[^<>]*$/.test(lineUpToCursor) ? 'grid' : null;
}

/**
 * 计算光标处的补全上下文；不在 <grid> 标签内返回 null。
 * 两种形态：
 *   `<grid dim`            → 补全属性名
 *   `<grid position="cen`  → 补全该属性的取值
 */
export function getSuggestContext(lineUpToCursor: string): SuggestContext | null {
  const tag = findOpenTag(lineUpToCursor);
  if (!tag) return null;

  const attributes = GRID_ATTRIBUTES;

  // 取值补全：光标在某个 name=" 之后且引号未闭合
  const valueMatch = /([\w-]+)\s*=\s*"([^"]*)$/.exec(lineUpToCursor);
  if (valueMatch) {
    const name = valueMatch[1];
    const def = attributes.find((attr) => attr.name === name);
    if (!def?.values) return null;
    const query = valueMatch[2];
    const items = def.values
      .filter((v) => v.value.toLowerCase().startsWith(query.toLowerCase()))
      .map((v) => ({ label: v.value, insert: `${v.value}"`, detail: v.detail }));
    return items.length > 0
      ? { start: lineUpToCursor.length - query.length, query, items }
      : null;
  }

  // 属性名补全：光标处于词首或词中
  const nameMatch = /(^|[\s])([\w-]*)$/.exec(lineUpToCursor);
  if (!nameMatch) return null;
  const query = nameMatch[2];
  const items = attributes
    .filter((attr) => attr.name.startsWith(query.toLowerCase()))
    .map((attr) => ({
      label: attr.name,
      insert: attr.boolean ? attr.name : `${attr.name}="`,
      detail: attr.detail,
    }));
  return items.length > 0 ? { start: lineUpToCursor.length - query.length, query, items } : null;
}
