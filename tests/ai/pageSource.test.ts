import { describe, it, expect } from 'vitest';
import { pageRange, replacePage } from '../../src/ai/pageSource';
import type { SlideDeck, SlidePage } from '../../src/types/slide';

const page = (sourceLine: number): SlidePage => ({
  index: 0,
  type: 'horizontal',
  sourceLine,
  html: '',
  notes: [],
  attributes: {},
});

const deck = (...lines: number[]): SlideDeck =>
  ({ pages: lines.map(page) }) as unknown as SlideDeck;

const NOTE = ['# 第一页', '', '正文一', '', '---', '', '# 第二页', '', '正文二', '', 'xxx', '', '# 第三页'].join('\n');

describe('pageRange', () => {
  it('cuts out just this page, without the separator', () => {
    const r = pageRange(NOTE, deck(0, 6, 12), 0)!;
    expect(r.text).toBe('# 第一页\n\n正文一');
  });

  it('handles the middle page', () => {
    expect(pageRange(NOTE, deck(0, 6, 12), 1)!.text).toBe('# 第二页\n\n正文二');
  });

  it('runs the last page to the end of the note', () => {
    expect(pageRange(NOTE, deck(0, 6, 12), 2)!.text).toBe('# 第三页');
  });

  it('returns null for a page that is not there', () => {
    expect(pageRange(NOTE, deck(0), 3)).toBeNull();
  });
});

describe('replacePage', () => {
  /* 改一页不能动到别页，分页符也必须原样留着 */
  it('swaps the page and keeps the rest byte for byte', () => {
    const r = pageRange(NOTE, deck(0, 6, 12), 1)!;
    const out = replacePage(NOTE, r, '# 换掉的第二页\n\n新正文');
    expect(out).toBe(
      ['# 第一页', '', '正文一', '', '---', '', '# 换掉的第二页', '', '新正文', '', 'xxx', '', '# 第三页'].join('\n'),
    );
  });
});
