/**
 * 回归：占位符必须扛得住真实 Obsidian 的 MarkdownRenderer。
 *
 * Obsidian 会把 HTML 注释整段丢弃，并给段落加 dir="auto"。
 * 早期版本用 <!--GRID_0--> 做占位符，结果一页里只剩占位符时渲染成空字符串，
 * 整个 deck 每页都是空白（实测于 82 个 grid 的真实课件笔记）。
 */
import { describe, it, expect } from 'vitest';
import { PipelineOrchestrator } from '../../src/processors';
import { DEFAULT_SETTINGS } from '../../src/types/config';

/** 贴近 Obsidian 行为的渲染桩：删注释 + <p dir="auto"> + 连续行合并为一段并插 <br> */
const obsidianLikeRender = async (markdown: string): Promise<string> => {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, '');
  return withoutComments
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
      // 段内换行 → <br>（Obsidian 的严格换行行为）
      return `<p dir="auto">${trimmed.split('\n').join('<br>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
};

const run = (md: string) =>
  new PipelineOrchestrator().run(md, {
    settings: { ...DEFAULT_SETTINGS },
    sourcePath: 'note.md',
    renderMarkdown: obsidianLikeRender,
  });

describe('placeholders survive the Obsidian renderer', () => {
  it('renders a page whose entire body is grids', async () => {
    const deck = await run(
      '<grid dimension="40 30" position="10 15">A</grid>\n\n<grid dimension="40 30" position="60 15">B</grid>',
    );
    const html = deck.pages[0].html;
    expect((html.match(/class="grid"/g) ?? []).length).toBe(2);
    expect(html).toContain('A');
    expect(html).toContain('B');
    expect(html).not.toContain('⟦RFO');
  });

  it('handles grids written on consecutive lines (one paragraph, <br> separated)', async () => {
    const deck = await run(
      '<grid dimension="100 11" position="0 85" style="background:#eee"></grid>\n<grid dimension="100 11" position="0 85">页脚</grid>',
    );
    const html = deck.pages[0].html;
    expect((html.match(/class="grid"/g) ?? []).length).toBe(2);
    // grid 的 div 不能留在段落里
    expect(html).not.toMatch(/<p[^>]*>\s*<div class="grid"/);
    expect(html).not.toContain('<br>');
  });

  it('keeps surrounding text when a paragraph mixes prose and a grid', async () => {
    const deck = await run('前面 <grid dimension="10 10" position="center">G</grid> 后面');
    const html = deck.pages[0].html;
    expect(html).toContain('前面');
    expect(html).toContain('后面');
    expect(html).toContain('class="grid"');
  });

  it('still resolves nested grids', async () => {
    const deck = await run(
      '<grid dimension="80 80" position="center">\n<grid dimension="50 50" position="topleft">inner</grid>\n</grid>',
    );
    expect((deck.pages[0].html.match(/class="grid"/g) ?? []).length).toBe(2);
    expect(deck.pages[0].html).not.toContain('⟦RFO');
  });

  it('does not leave an empty page body', async () => {
    const deck = await run('<grid dimension="22 12" position="6 7">logo</grid>\n\nnote:\n讲稿');
    expect(deck.pages[0].html.length).toBeGreaterThan(0);
    expect(deck.pages[0].notes).toHaveLength(1);
  });
});

describe('element comments survive the Obsidian renderer', () => {
  it('applies .element style to the heading it follows', async () => {
    const deck = await run('# 标题<!-- .element: style="font-size:100px" -->');
    expect(deck.pages[0].html).toContain('font-size:100px');
  });

  it('applies .element inside a grid', async () => {
    const deck = await run(
      '<grid dim="76 24" pos="12 30">\n\n# 标题<!-- .element: style="font-size:100px" -->\n\n</grid>',
    );
    expect(deck.pages[0].html).toContain('font-size:100px');
  });

  it('collects .slide attributes', async () => {
    const deck = await run('内容\n\n<!-- .slide: background-color="#101010" -->');
    expect(deck.pages[0].attributes['data-background-color']).toBe('#101010');
  });
});
