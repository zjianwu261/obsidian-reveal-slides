/**
 * 光标跟随的行号映射：源码行 → 页序号 → reveal 的 [h, v] 坐标。
 * 行号必须对得上源文件，所以 frontmatter 的偏移和 <style> 块占的行数都要算进去。
 */
import { describe, it, expect } from 'vitest';
import { PipelineOrchestrator } from '../../src/processors';
import { lineToPageIndex, pageIndexToPosition } from '../../src/engine/templateEngine';
import { DEFAULT_SETTINGS } from '../../src/types/config';

const render = async (md: string): Promise<string> => md;

const run = (md: string) =>
  new PipelineOrchestrator().run(md, {
    settings: { ...DEFAULT_SETTINGS },
    sourcePath: 'note.md',
    renderMarkdown: render,
  });

describe('sourceLine', () => {
  it('numbers pages from the top of the file', async () => {
    // 0:# A  1:(空)  2:---  3:(空)  4:# B
    const deck = await run('# A\n\n---\n\n# B');
    expect(deck.pages.map((p) => p.sourceLine)).toEqual([0, 3]);
  });

  it('accounts for frontmatter lines', async () => {
    const deck = await run('---\ntitle: T\n---\n# A\n\n---\n\n# B');
    // frontmatter 占 0-2 行，正文从第 3 行开始
    expect(deck.pages[0].sourceLine).toBe(3);
    expect(deck.pages[1].sourceLine).toBe(6);
  });

  it('keeps line numbers aligned across a <style> block', async () => {
    const deck = await run('<style>\n.a { color: red; }\n</style>\n\n# A\n\n---\n\n# B');
    // <style> 占 0-2 行，第二页起始行不能因为剥离样式而前移
    expect(deck.pages[0].sourceLine).toBe(0);
    expect(deck.pages[1].sourceLine).toBe(7);
  });

  it('numbers vertical pages too', async () => {
    const deck = await run('# A\nxxx\n# A2\n---\n# B');
    expect(deck.pages.map((p) => [p.type, p.sourceLine])).toEqual([
      ['horizontal', 0],
      ['vertical', 2],
      ['horizontal', 4],
    ]);
  });
});

describe('lineToPageIndex', () => {
  it('maps a cursor line to the page that contains it', async () => {
    const deck = await run('# A\n\n---\n\n# B\n\n---\n\n# C');
    expect(lineToPageIndex(deck, 0)).toBe(0);
    expect(lineToPageIndex(deck, 1)).toBe(0);
    expect(lineToPageIndex(deck, 4)).toBe(1);
    expect(lineToPageIndex(deck, 8)).toBe(2);
  });

  it('clamps past the end and before the first page', async () => {
    const deck = await run('# A\n\n---\n\n# B');
    expect(lineToPageIndex(deck, 999)).toBe(1);
    expect(lineToPageIndex(deck, -5)).toBe(0);
  });
});

describe('pageIndexToPosition', () => {
  it('turns a flat index into reveal h/v coordinates', async () => {
    const deck = await run('# A\nxxx\n# A2\nxxx\n# A3\n---\n# B\nxxx\n# B2');
    expect(deck.pages.map((_, i) => pageIndexToPosition(deck, i))).toEqual([
      { h: 0, v: 0 },
      { h: 0, v: 1 },
      { h: 0, v: 2 },
      { h: 1, v: 0 },
      { h: 1, v: 1 },
    ]);
  });

  it('matches the grouping used to build the sections', async () => {
    const deck = await run('# A\n---\n# B\nxxx\n# B2');
    expect(pageIndexToPosition(deck, 2)).toEqual({ h: 1, v: 1 });
  });
});
