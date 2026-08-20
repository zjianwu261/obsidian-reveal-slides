/**
 * 「当前这一页」在笔记源码里的范围（纯函数，可单测）。
 *
 * 对话框的上下文必须是**正在预览的那一页**，不是整篇笔记：一篇课件几千行，
 * 整篇塞给模型既贵又容易让它改错地方；而作者说「把这页的图换成对比图」时，
 * 心里指的就是眼前这一页。
 *
 * 页的起始行由管线给出（SlidePage.sourceLine，已算上 frontmatter 与 <style> 占的行）。
 * 结束行是下一页的起始行往回退：分页符那一行、以及它前面的空行都不属于本页。
 */
import type { SlideDeck } from '../types/slide';

export interface PageRange {
  /** 0 基起始行（含） */
  start: number;
  /** 0 基结束行（不含） */
  end: number;
  text: string;
}

/** 分页符：水平 --- / 垂直 xxx（允许行尾空白） */
const SEPARATOR_RE = /^(?:---|xxx)[ \t]*$/;

export function pageRange(source: string, deck: SlideDeck, index: number): PageRange | null {
  const page = deck.pages[index];
  if (!page) return null;

  const lines = source.split('\n');
  const start = Math.min(Math.max(page.sourceLine, 0), lines.length);
  const next = deck.pages[index + 1];
  let end = next ? Math.min(next.sourceLine, lines.length) : lines.length;

  // 往回退掉分页符与它前后的空行，只留这一页自己的内容
  while (end > start && (SEPARATOR_RE.test(lines[end - 1] ?? '') || (lines[end - 1] ?? '').trim() === '')) {
    end--;
  }

  return { start, end, text: lines.slice(start, end).join('\n') };
}

/**
 * 用新内容替换该页，返回整篇笔记的新文本（页与页之间的分页符原样保留）。
 *
 * 两头各垫一个空行：分页符后面紧跟 <grid> 时，源码读起来是糊的 ——
 * 一眼分不出哪儿是页与页的缝。模型给回来的那段常常不带这个空行，
 * 这里补上，省得每次手动加。
 */
export function replacePage(source: string, range: PageRange, replacement: string): string {
  const lines = source.split('\n');
  const body = replacement.replace(/\s+$/, '').split('\n');

  const before = range.start > 0 ? lines[range.start - 1] : '';
  const after = range.end < lines.length ? lines[range.end] : '';
  const lead = range.start > 0 && before.trim() !== '' ? [''] : [];
  const tail = range.end < lines.length && after.trim() !== '' ? [''] : [];

  return [
    ...lines.slice(0, range.start),
    ...lead,
    ...body,
    ...tail,
    ...lines.slice(range.end),
  ].join('\n');
}
