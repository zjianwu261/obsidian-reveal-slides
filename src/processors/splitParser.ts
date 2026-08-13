import type { SplitElement } from '../types/grid';
import { SPLIT_PLACEHOLDER_PREFIX, PLACEHOLDER_CLOSE, splitPlaceholder } from '../constants';

export interface SplitParseResult {
  html: string;
  splits: SplitElement[];
}

/** 只匹配「最内层」split，由内向外反复替换以支持嵌套（同 gridParser） */
const INNERMOST_SPLIT_RE = /<split\s*([^>]*)>((?:(?!<split[\s>])[\s\S])*?)<\/split>/g;
const ATTR_RE = /([\w-]+)(?:\s*=\s*"([^"]*)")?/g;

/** 嵌套解析的最大层数 */
const MAX_NESTING = 8;

function parseAttributes(attrText: string): Record<string, string | true> {
  const attrs: Record<string, string | true> = {};
  for (const match of attrText.matchAll(ATTR_RE)) {
    attrs[match[1]] = match[2] ?? true;
  }
  return attrs;
}

function toNumber(value: string | true | undefined, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * 解析 <split> 标签为占位符 + SplitElement 列表。
 * 栏之间用空行分隔；columns 为未渲染的 Markdown。
 * 支持嵌套：内层先替换为占位符注释（单行，不会打乱外层的按空行分栏）。
 */
export function parseSplitTags(input: string): SplitParseResult {
  const splits: SplitElement[] = [];

  let html = input;
  for (let depth = 0; depth < MAX_NESTING && html.includes('</split>'); depth++) {
    const next = parseInnermostSplits(html, splits);
    if (next === html) break;
    html = next;
  }

  return { html, splits };
}

/** 替换当前文本中所有最内层 split，返回替换后的文本 */
function parseInnermostSplits(input: string, splits: SplitElement[]): string {
  return input.replace(INNERMOST_SPLIT_RE, (_whole, attrText: string, content: string) => {
    const attrs = parseAttributes(attrText);

    const columns = content
      .split(/\n\s*\n/)
      .map((col) => col.trim())
      .filter((col) => col.length > 0);

    const split: SplitElement = {
      tag: 'split',
      even: attrs.even === true || attrs.even === 'true',
      gap: toNumber(attrs.gap, 0),
      left: toNumber(attrs.left, 1),
      right: toNumber(attrs.right, 1),
      wrap: typeof attrs.wrap === 'string' ? toNumber(attrs.wrap, 0) : attrs.wrap === true ? 0 : null,
      noMargin: attrs['no-margin'] === true || attrs['no-margin'] === 'true',
      columns,
    };

    const index = splits.length;
    splits.push(split);
    return splitPlaceholder(index);
  });
}

export function isSplitPlaceholder(text: string): number | null {
  const match = new RegExp(`^${SPLIT_PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_CLOSE}$`).exec(text.trim());
  return match ? Number(match[1]) : null;
}
