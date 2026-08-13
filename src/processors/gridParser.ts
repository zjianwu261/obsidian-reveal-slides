import type { GridElement } from '../types/grid';
import { GRID_PLACEHOLDER_PREFIX, PLACEHOLDER_CLOSE, gridPlaceholder } from '../constants';
import { replaceOutsideCode } from '../utils/codeRanges';

export interface GridParseResult {
  /** 替换为 ⟦RFO-GRID-n⟧ 占位符后的文本 */
  html: string;
  grids: GridElement[];
}

/**
 * 只匹配「最内层」grid：内容里不再出现 <grid 开标签。
 * 由内向外反复替换即可支持嵌套（外层 grid 的 children 里留着内层的占位符）。
 */
const INNERMOST_GRID_RE = /<grid(?:\s+([^>]*))?>((?:(?!<grid[\s>])[\s\S])*?)<\/grid>/g;
const ATTR_RE = /([\w-]+)(?:\s*=\s*"([^"]*)")?/g;

/** 嵌套解析的最大层数（防病态输入死循环） */
const MAX_NESTING = 8;

const SINGLE_KEYWORDS: Record<string, [string, string]> = {
  top: ['50%', '0%'],
  bottom: ['50%', '100%'],
  left: ['0%', '50%'],
  right: ['100%', '50%'],
  center: ['50%', '50%'],
};

const CORNER_KEYWORDS: Record<string, [string, string]> = {
  topleft: ['0%', '0%'],
  topright: ['100%', '0%'],
  bottomleft: ['0%', '100%'],
  bottomright: ['100%', '100%'],
};

const H_KEYWORDS: Record<string, string> = { left: '0%', right: '100%', center: '50%' };
const V_KEYWORDS: Record<string, string> = { top: '0%', bottom: '100%', center: '50%' };

/** 锚点：元素自身按百分比回移的量（配合 left/top 使用，见 resolvePosition） */
type Axis = { value: string; anchor: string };

function toCssNumber(token: string): Axis {
  const num = Number(token);
  if (!Number.isFinite(num)) {
    // 无法识别的数值（如写成 "20%"）：按 0 处理，避免生成 NaN
    return { value: '0%', anchor: '0' };
  }
  if (num < 0) {
    // 负数 = 距右/下边缘的间距，元素的远端边缘对齐到该点
    return { value: `calc(100% - ${Math.abs(num)}%)`, anchor: '-100%' };
  }
  return { value: `${num}%`, anchor: '0' };
}

/** 关键字位置：left/top 落在画布的百分比点上，元素同比例回移，才能真正贴边/居中 */
function toKeywordAxis(percent: string): Axis {
  return { value: percent, anchor: percent === '0%' ? '0' : `-${percent}` };
}

export interface ResolvedPosition {
  /** 规范化后的 [left, top] CSS 值 */
  position: [string, string];
  /** 元素自身的回移量 [x, y]，交给 transform: translate() */
  anchor: [string, string];
}

/**
 * position 规范化（只在此一处完成，Transformer 直接拼接）。
 *   "20 25"      → left/top = 20% / 25%，元素左上角对齐该点
 *   "top"        → 50% / 0%，回移 -50% / 0（单关键字: 另一轴居中）
 *   "topleft"    → 0% / 0%，不回移
 *   "bottomright"→ 100% / 100%，回移 -100% / -100%（右下角贴边）
 *   "-6 -8"      → calc(100% - 6%) / calc(100% - 8%)，回移 -100%（距右下边缘 6% / 8%）
 * 单位一律是画布百分比：reveal 把整块画布等比缩放到窗口，百分比在任何屏幕上都成立，
 * 而绝对像素会跟画布尺寸绑死（改 size 比例后就跑位），故不提供。
 * 关键字与负数必须配合 anchor 回移，否则元素会整体跑出画布。
 */
export function resolvePosition(position: string): ResolvedPosition {
  const trimmed = position.trim().toLowerCase();

  const keyword = CORNER_KEYWORDS[trimmed] ?? SINGLE_KEYWORDS[trimmed];
  if (keyword) return fromAxes(toKeywordAxis(keyword[0]), toKeywordAxis(keyword[1]));

  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 2) {
    const [a, b] = tokens;
    const aIsKeyword = a in H_KEYWORDS || a in V_KEYWORDS;
    const bIsKeyword = b in H_KEYWORDS || b in V_KEYWORDS;

    if (!aIsKeyword && !bIsKeyword) {
      return fromAxes(toCssNumber(a), toCssNumber(b));
    }
    // 两个关键字组合（如 "left top"）
    const left = a in H_KEYWORDS ? H_KEYWORDS[a] : b in H_KEYWORDS ? H_KEYWORDS[b] : '50%';
    const top = a in V_KEYWORDS ? V_KEYWORDS[a] : b in V_KEYWORDS ? V_KEYWORDS[b] : '50%';
    return fromAxes(toKeywordAxis(left), toKeywordAxis(top));
  }

  // 无法识别时居中，避免布局崩坏
  return fromAxes(toKeywordAxis('50%'), toKeywordAxis('50%'));
}

function fromAxes(x: Axis, y: Axis): ResolvedPosition {
  return { position: [x.value, y.value], anchor: [x.anchor, y.anchor] };
}

/** 仅取 [left, top]（保留原接口） */
export function normalizePosition(position: string): [string, string] {
  return resolvePosition(position).position;
}

function parseAttributes(attrText: string): Record<string, string | true> {
  const attrs: Record<string, string | true> = {};
  for (const match of attrText.matchAll(ATTR_RE)) {
    attrs[match[1]] = match[2] ?? true;
  }
  return attrs;
}

function parseDimension(value: string | true | undefined): [number, number] {
  if (typeof value !== 'string') return [100, 100];
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
    return [parts[0], parts[1]];
  }
  return [100, 100];
}

/**
 * 解析 <grid> 标签为占位符 + GridElement 列表（children 为未渲染的 Markdown）。
 * 支持嵌套：由内向外逐层替换，内层 grid 的索引小于外层，
 * 外层的 children 里保留 ⟦RFO-GRID-n⟧ 占位符，由管线的多轮替换解开。
 */
export function parseGridTags(input: string): GridParseResult {
  const grids: GridElement[] = [];

  let html = input;
  for (let depth = 0; depth < MAX_NESTING && html.includes('</grid>'); depth++) {
    const next = parseInnermostGrids(html, grids);
    if (next === html) break; // 没有成对标签可解析，避免空转
    html = next;
  }

  return { html, grids };
}

/**
 * 替换当前文本中所有最内层 grid，返回替换后的文本。
 * 代码块里的 `<grid>` 是示例，原样保留（每轮都要重新算范围：文本已被上一轮改写）。
 */
function parseInnermostGrids(input: string, grids: GridElement[]): string {
  return replaceOutsideCode(input, INNERMOST_GRID_RE, (_whole, attrText, childText) => {
    const children = childText ?? '';
    const attrs = parseAttributes(attrText ?? '');
    // 尺寸/位置支持三种写法，语义完全相同：
    //   dim / pos           —— 推荐的短写
    //   dimension / position —— 完整写法
    //   drag / drop          —— obsidian-advanced-slides 的写法，老笔记无需改写
    const dimensionAttr = attrs.dim ?? attrs.dimension ?? attrs.drag;
    const positionAttr = attrs.pos ?? attrs.position ?? attrs.drop;
    const position = typeof positionAttr === 'string' ? positionAttr : 'center';
    const resolved = resolvePosition(position);

    const grid: GridElement = {
      tag: 'grid',
      dimension: parseDimension(dimensionAttr),
      position: resolved.position,
      anchor: resolved.anchor,
      style: typeof attrs.style === 'string' ? attrs.style : '',
      className: typeof attrs.class === 'string' ? attrs.class : '',
      shape: typeof attrs.shape === 'string' ? attrs.shape : null,
      fragment: typeof attrs.frag === 'string' ? attrs.frag : attrs.frag === true ? '' : null,
      animate: typeof attrs.animate === 'string' ? attrs.animate : null,
      children: children.trim(),
    };

    const index = grids.length;
    grids.push(grid);
    return gridPlaceholder(index);
  });
}

/** 判断文本是否为 grid 占位符，是则返回索引 */
export function isGridPlaceholder(text: string): number | null {
  const match = new RegExp(`^${GRID_PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_CLOSE}$`).exec(text.trim());
  return match ? Number(match[1]) : null;
}
