import { describe, it, expect } from 'vitest';
import { findSvgFoldRanges } from '../../src/editor/svgFoldRanges';

/** 用折叠区间切出被折起来的原文，便于直观断言 */
const folded = (md: string, minLines?: number): string[] =>
  findSvgFoldRanges(md, minLines).map((r) => md.slice(r.from, r.to));

const svgBlock = (fence = '```') =>
  `${fence}svg\n<svg viewBox="0 0 100 100">\n  <circle cx="50" cy="50" r="40">\n    <animate attributeName="r" values="10;40" dur="2s"/>\n  </circle>\n</svg>\n${fence}`;

describe('findSvgFoldRanges', () => {
  it('folds from the fence line break through the closing fence', () => {
    const md = `# A\n\n${svgBlock()}\n\n正文`;
    const [range] = findSvgFoldRanges(md);

    // 起点是 ```svg 行末的换行符：折起来后这一行还在
    expect(md.slice(0, range.from).endsWith('```svg')).toBe(true);
    expect(md.slice(range.from, range.to).startsWith('\n<svg')).toBe(true);
    expect(md.slice(range.from, range.to).endsWith('```')).toBe(true);
    // 结束围栏后的换行留在区间外，后面的正文不会被并上来
    expect(md.slice(range.to)).toBe('\n\n正文');
  });

  it('finds every svg block in a note', () => {
    const md = `${svgBlock()}\n\n---\n\n${svgBlock()}`;
    expect(folded(md)).toHaveLength(2);
  });

  it('leaves other languages alone', () => {
    const md = '```js\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\n```';
    expect(folded(md)).toEqual([]);
  });

  it('only matches an exact svg info string', () => {
    const md = '```svg-example\n1\n2\n3\n4\n```';
    expect(folded(md)).toEqual([]);
  });

  it('skips svg examples nested in a wider fence', () => {
    // 讲语法的笔记：````markdown 里包着一个 ```svg 示例，那是给人看的，不是真块
    const md = `\`\`\`\`markdown\n${svgBlock()}\n\`\`\`\``;
    expect(folded(md)).toEqual([]);
  });

  it('ignores an unclosed fence', () => {
    const md = '```svg\n<svg>\n1\n2\n3\n4\n5';
    expect(folded(md)).toEqual([]);
  });

  it('leaves short blocks alone', () => {
    const md = '```svg\n<svg viewBox="0 0 10 10"><circle r="4"/></svg>\n```';
    expect(folded(md)).toEqual([]);
    // 阈值可调：降到 1 行就该折了
    expect(folded(md, 1)).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    const md = `# A\r\n\r\n${svgBlock().replace(/\n/g, '\r\n')}\r\n`;
    const [range] = findSvgFoldRanges(md);
    expect(md.slice(0, range.from).endsWith('```svg\r')).toBe(true);
    expect(md.slice(range.from, range.to).endsWith('```\r')).toBe(true);
  });

  it('folds a ~~~ fenced block too', () => {
    expect(folded(svgBlock('~~~'))).toHaveLength(1);
  });
});
