import type { GridElement } from '../types/grid';
import { GRID_PLACEHOLDER_PREFIX } from '../constants';

export interface GridParseResult {
  /** 替换为 <!--GRID_n--> 占位符后的文本 */
  html: string;
  grids: GridElement[];
}

const GRID_RE = /<grid(?:\s+([^>]*))?>([\s\S]*?)<\/grid>/g;
const ATTR_RE = /([\w-]+)(?:\s*=\s*"([^"]*)")?/g;

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

function toCssNumber(token: string, absolute: boolean): string {
  const num = Number(token);
  const unit = absolute ? 'px' : '%';
  if (num < 0) {
    return `calc(100% - ${Math.abs(num)}${unit})`;
  }
  return `${num}${unit}`;
}

/**
 * position 规范化（只在此一处完成，Transformer 直接拼接）。
 *   "20 25"      → ['20%', '25%']
 *   "top"        → ['50%', '0%']     （单关键字: 另一轴居中）
 *   "topleft"    → ['0%', '0%']      （角关键字）
 *   "left"       → ['0%', '50%']
 *   "-6 -8"      → ['calc(100% - 6%)', 'calc(100% - 8%)']
 *   absolute=true → 单位用 px
 */
export function normalizePosition(position: string, absolute: boolean): [string, string] {
  const trimmed = position.trim().toLowerCase();

  if (trimmed in CORNER_KEYWORDS) return CORNER_KEYWORDS[trimmed];
  if (trimmed in SINGLE_KEYWORDS) return SINGLE_KEYWORDS[trimmed];

  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 2) {
    const [a, b] = tokens;
    const aIsKeyword = a in H_KEYWORDS || a in V_KEYWORDS;
    const bIsKeyword = b in H_KEYWORDS || b in V_KEYWORDS;

    if (!aIsKeyword && !bIsKeyword) {
      return [toCssNumber(a, absolute), toCssNumber(b, absolute)];
    }
    // 两个关键字组合（如 "left top"）
    const left = a in H_KEYWORDS ? H_KEYWORDS[a] : b in H_KEYWORDS ? H_KEYWORDS[b] : '50%';
    const top = a in V_KEYWORDS ? V_KEYWORDS[a] : b in V_KEYWORDS ? V_KEYWORDS[b] : '50%';
    return [left, top];
  }

  // 无法识别时居中，避免布局崩坏
  return ['50%', '50%'];
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

/** 解析 <grid> 标签为占位符 + GridElement 列表（children 为未渲染的 Markdown） */
export function parseGridTags(input: string): GridParseResult {
  const grids: GridElement[] = [];

  const html = input.replace(GRID_RE, (_whole, attrText: string, children: string) => {
    const attrs = parseAttributes(attrText ?? '');
    const absolute = attrs.absolute === true || attrs.absolute === 'true';
    const position = typeof attrs.position === 'string' ? attrs.position : 'center';

    const grid: GridElement = {
      tag: 'grid',
      dimension: parseDimension(attrs.dimension),
      position: normalizePosition(position, absolute),
      absolute,
      style: typeof attrs.style === 'string' ? attrs.style : '',
      className: typeof attrs.class === 'string' ? attrs.class : '',
      shape: typeof attrs.shape === 'string' ? attrs.shape : null,
      fragment: typeof attrs.frag === 'string' ? attrs.frag : attrs.frag === true ? '' : null,
      animate: typeof attrs.animate === 'string' ? attrs.animate : null,
      children: children.trim(),
    };

    const index = grids.length;
    grids.push(grid);
    return `<!--${GRID_PLACEHOLDER_PREFIX}${index}-->`;
  });

  return { html, grids };
}

/** 判断占位符注释是否对应 grid 索引 */
export function isGridPlaceholder(text: string): number | null {
  const match = new RegExp(`^${GRID_PLACEHOLDER_PREFIX}(\\d+)$`).exec(text.trim());
  return match ? Number(match[1]) : null;
}
