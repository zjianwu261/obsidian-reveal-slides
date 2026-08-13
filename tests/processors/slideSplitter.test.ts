import { describe, it, expect } from 'vitest';
import { splitSlides } from '../../src/processors/slideSplitter';

const SEP = '\\r?\\n---\\r?\\n';
const VSEP = '\\r?\\nxxx\\r?\\n';

describe('splitSlides', () => {
  it('splits horizontal slides', () => {
    const { slides } = splitSlides('page1\n---\npage2\n---\npage3', SEP, VSEP);
    expect(slides).toHaveLength(3);
    expect(slides.map((s) => s.content)).toEqual(['page1', 'page2', 'page3']);
    expect(slides.every((s) => s.type === 'horizontal')).toBe(true);
  });

  it('does not split on --- inside fenced code blocks', () => {
    const md = 'before\n\n```\n---\n```\n\nafter\n---\npage2';
    const { slides } = splitSlides(md, SEP, VSEP);
    expect(slides).toHaveLength(2);
    expect(slides[0].content).toContain('```');
    expect(slides[1].content).toBe('page2');
  });

  it('does not split on xxx inside a fenced code block on a later page', () => {
    const md = ['page1', '---', '```js', 'const a = 1;', 'xxx', 'const b = 2;', '```'].join('\n');
    const { slides } = splitSlides(md, SEP, VSEP);
    expect(slides).toHaveLength(2);
    expect(slides[1].content).toContain('const b = 2;');
    expect(slides.some((s) => s.type === 'vertical')).toBe(false);
  });

  it('does not split on --- inside a fenced code block after a long first page', () => {
    // 代码范围下标必须按当前分块现算，否则长的首页会把范围整体推偏
    const md = ['A'.repeat(200), '---', '```js', 'a', 'xxx', 'b', '```'].join('\n');
    const { slides } = splitSlides(md, SEP, VSEP);
    expect(slides).toHaveLength(2);
    expect(slides[1].content).toContain('xxx');
  });

  it('does not split on --- inside inline code', () => {
    const md = 'a `code\n---\ncode` b\n---\npage2';
    const { slides } = splitSlides(md, SEP, VSEP);
    expect(slides).toHaveLength(2);
  });

  it('nests vertical slides under the previous horizontal slide', () => {
    const md = 'h1\nxxx\nv1\nxxx\nv2\n---\nh2';
    const { slides } = splitSlides(md, SEP, VSEP);
    expect(slides.map((s) => [s.content, s.type])).toEqual([
      ['h1', 'horizontal'],
      ['v1', 'vertical'],
      ['v2', 'vertical'],
      ['h2', 'horizontal'],
    ]);
  });

  it('splits on configured heading levels (headingDivider)', () => {
    const md = '# Title\n\nintro\n\n## Section\n\nbody';
    const { slides } = splitSlides(md, SEP, VSEP, [1, 2]);
    expect(slides.length).toBeGreaterThanOrEqual(2);
    expect(slides.some((s) => s.content.includes('## Section'))).toBe(true);
  });

  it('does not split on headings of other levels', () => {
    const md = '# Title\n\n### Sub\n\nbody';
    const { slides } = splitSlides(md, SEP, VSEP, [1]);
    expect(slides).toHaveLength(1);
  });

  it('falls back to default separator on invalid regex', () => {
    const { slides } = splitSlides('a\n---\nb', '([invalid', VSEP);
    expect(slides).toHaveLength(2);
  });

  it('handles CRLF separators', () => {
    const { slides } = splitSlides('p1\r\n---\r\np2', SEP, VSEP);
    expect(slides).toHaveLength(2);
  });

  it('treats a literal separator as a whole-line marker', () => {
    // 用户在设置里直接填 '---' / 'xxx'（非正则）时按整行标记处理
    const { slides } = splitSlides('a xxxxxxxxx b\n---\npage2', '---', 'xxx');
    expect(slides).toHaveLength(2);
    expect(slides[0].content).toBe('a xxxxxxxxx b');
  });

  it('treats a literal vertical separator as a whole-line marker', () => {
    const { slides } = splitSlides('h1\nxxx\nv1', '---', 'xxx');
    expect(slides.map((s) => s.type)).toEqual(['horizontal', 'vertical']);
  });

  it('filters out empty slides from consecutive separators', () => {
    // 'xxx' 独占一行切分后产生空内容页，应被过滤
    const { slides } = splitSlides('title\n---\n\nxxx\n', SEP, 'xxx');
    expect(slides).toHaveLength(1);
    expect(slides[0].content).toBe('title');
  });

  it('keeps at least one slide for empty input', () => {
    const { slides } = splitSlides('', SEP, VSEP);
    expect(slides).toHaveLength(1);
  });
});
