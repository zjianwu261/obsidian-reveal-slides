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

  /* 分页符后面紧跟 <grid> 时，一眼分不出哪儿是页与页的缝 */
  it('keeps a blank line between the separator and the page', () => {
    const source = ['xxx', '<grid class="bar">', '## 旧标题', '</grid>', 'xxx'].join('\n');
    const range = { start: 1, end: 4, text: '' };
    const out = replacePage(source, range, '<grid class="bar">\n## 新标题\n</grid>');
    expect(out).toBe(
      ['xxx', '', '<grid class="bar">', '## 新标题', '</grid>', '', 'xxx'].join('\n'),
    );
  });

  /* 本来就空着的地方别再垫一行，来回几次会攒出一堆空行 */
  it('does not stack blank lines that are already there', () => {
    const source = ['xxx', '', '正文', '', 'xxx'].join('\n');
    const range = { start: 2, end: 3, text: '正文' };
    expect(replacePage(source, range, '新正文')).toBe(
      ['xxx', '', '新正文', '', 'xxx'].join('\n'),
    );
  });

  /* 页在开头/结尾时前后没有东西可隔，别凭空多出空行 */
  it('adds nothing at the very start of the note', () => {
    const source = ['正文', '', 'xxx'].join('\n');
    expect(replacePage(source, { start: 0, end: 1, text: '正文' }, '新正文')).toBe(
      ['新正文', '', 'xxx'].join('\n'),
    );
  });
});
