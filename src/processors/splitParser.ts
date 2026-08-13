import type { SplitElement } from '../types/grid';
import { SPLIT_PLACEHOLDER_PREFIX } from '../constants';

export interface SplitParseResult {
  html: string;
  splits: SplitElement[];
}

const SPLIT_RE = /<split\s*([^>]*)>([\s\S]*?)<\/split>/g;
const ATTR_RE = /([\w-]+)(?:\s*=\s*"([^"]*)")?/g;

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
 */
export function parseSplitTags(input: string): SplitParseResult {
  const splits: SplitElement[] = [];

  const html = input.replace(SPLIT_RE, (_whole, attrText: string, content: string) => {
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
    return `<!--${SPLIT_PLACEHOLDER_PREFIX}${index}-->`;
  });

  return { html, splits };
}

export function isSplitPlaceholder(text: string): number | null {
  const match = new RegExp(`^${SPLIT_PLACEHOLDER_PREFIX}(\\d+)$`).exec(text.trim());
  return match ? Number(match[1]) : null;
}
