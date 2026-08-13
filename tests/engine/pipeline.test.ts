import { describe, it, expect } from 'vitest';
import { PipelineOrchestrator, mergeConfig } from '../../src/processors';
import { DEFAULT_SETTINGS } from '../../src/types/config';

/** 极简 Markdown 渲染桩：标题与段落 */
const fakeRender = async (markdown: string): Promise<string> => {
  return markdown
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${heading[2]}</h${level}>`;
      }
      return `<p>${trimmed}</p>`;
    })
    .filter(Boolean)
    .join('\n');
};

const pipeline = new PipelineOrchestrator();
const run = (md: string) =>
  pipeline.run(md, {
    settings: { ...DEFAULT_SETTINGS },
    sourcePath: 'test.md',
    renderMarkdown: fakeRender,
  });

describe('mergeConfig', () => {
  it('overrides whitelisted keys only', () => {
    const config = mergeConfig(DEFAULT_SETTINGS, {
      transition: 'fade',
      port: 9999, // 不在白名单
      title: 'My Talk',
    });
    expect(config.transition).toBe('fade');
    expect(config.title).toBe('My Talk');
    expect((config as Record<string, unknown>).port).toBe(8347);
  });
});

describe('PipelineOrchestrator (MVP)', () => {
  it('converts a multi-page note into a SlideDeck', async () => {
    const deck = await run('# Page 1\n---\n# Page 2\nxxx\n# Page 2.1');
    expect(deck.pages).toHaveLength(3);
    expect(deck.pages[0].type).toBe('horizontal');
    expect(deck.pages[1].type).toBe('horizontal');
    expect(deck.pages[2].type).toBe('vertical');
    expect(deck.pages[0].html).toContain('<h1>Page 1</h1>');
  });

  it('applies frontmatter config', async () => {
    const deck = await run('---\ntitle: Talk\ntransition: zoom\nsize: 16:9\n---\n# Hi');
    expect(deck.title).toBe('Talk');
    expect(deck.config.transition).toBe('zoom');
    expect(deck.config.size).toBe('16:9');
  });

  it('produces rendered html per page', async () => {
    const deck = await run('Para one\n\n---\n\nPara two');
    expect(deck.pages[0].html).toContain('<p>Para one</p>');
    expect(deck.pages[1].html).toContain('<p>Para two</p>');
  });

  it('renders grid tags into absolutely positioned divs', async () => {
    const deck = await run(
      '<grid dimension="60 30" position="20 25" style="background: red;">hi</grid>',
    );
    const html = deck.pages[0].html;
    expect(html).toContain('class="grid"');
    expect(html).toContain('width: 60%;');
    expect(html).toContain('left: 20%;');
    expect(html).toContain('background: red;');
    expect(html).not.toContain('GRID_0');
  });

  it('renders split tags into flex columns', async () => {
    const deck = await run('<split even gap="2">col a\n\ncol b</split>');
    const html = deck.pages[0].html;
    expect(html).toContain('class="split"');
    expect(html).toContain('gap: 2em');
  });

  it('extracts speaker notes per page', async () => {
    const deck = await run('# Talk\n\nnote:\nhello audience\n\n---\n\n# Next');
    expect(deck.pages[0].notes).toHaveLength(1);
    expect(deck.pages[0].notes[0].content).toContain('hello audience');
    expect(deck.pages[1].notes).toHaveLength(0);
  });

  it('extracts style blocks into cssVariables', async () => {
    const deck = await run('<style>:root { --brand: #f00; }</style>\n\n# Hi');
    expect(deck.cssVariables).toContain('--brand: #f00;');
    expect(deck.pages[0].html).not.toContain('--brand');
  });
});
