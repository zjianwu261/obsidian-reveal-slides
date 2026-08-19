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
    expect((config as Record<string, unknown>).port).toBe(3000);
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
      '<grid dim="60 30" pos="20 25" style="background: red;">hi</grid>',
    );
    const html = deck.pages[0].html;
    expect(html).toContain('class="grid"');
    expect(html).toContain('width: 60%;');
    expect(html).toContain('left: 20%;');
    expect(html).toContain('background: red;');
    expect(html).not.toContain('GRID_0');
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

  it('rewrites app:// image urls via serverBase', async () => {
    const deck = await pipeline.run('<img src="app://id/Users/me/pic.png?1">', {
      settings: { ...DEFAULT_SETTINGS },
      sourcePath: 'test.md',
      renderMarkdown: fakeRender,
      serverBase: 'http://127.0.0.1:3000',
    });
    expect(deck.pages[0].html).toContain('http://127.0.0.1:3000/vault/Users/me/pic.png');
  });

  it('collects .slide comments into page attributes', async () => {
    const deck = await run('Content\n\n<!-- .slide: background-color="#123456" -->');
    expect(deck.pages[0].attributes['data-background-color']).toBe('#123456');
    expect(deck.pages[0].html).not.toContain('.slide');
  });

  it('applies .element comments to the previous element', async () => {
    const deck = await run('Hello world\n\n<!-- .element: class="big" -->');
    expect(deck.pages[0].html).toContain('class="big"');
  });

  it('replaces emoji shortcodes in page html', async () => {
    const deck = await run('Ship it :rocket:');
    expect(deck.pages[0].html).toContain('🚀');
  });

  it('keeps grid placeholders intact through the new post-processors', async () => {
    const deck = await run('<grid dim="60 30" pos="20 25">hi</grid>');
    expect(deck.pages[0].html).toContain('class="grid"');
    expect(deck.pages[0].html).not.toContain('GRID_0');
  });

  it('post-processes content inside a grid', async () => {
    const deck = await pipeline.run(
      '<grid dim="60 30" pos="center">\n<img src="app://id/Users/me/pic.png?1">\n\nShip it :rocket:\n</grid>',
      {
        settings: { ...DEFAULT_SETTINGS },
        sourcePath: 'test.md',
        renderMarkdown: fakeRender,
        serverBase: 'http://127.0.0.1:3000',
      },
    );
    const html = deck.pages[0].html;
    expect(html).toContain('http://127.0.0.1:3000/vault/Users/me/pic.png');
    expect(html).not.toContain('app://');
    expect(html).toContain('🚀');
  });

  it('collects .slide comments written inside a grid', async () => {
    const deck = await run(
      '<grid dim="50 50" pos="center">\n\nContent\n\n<!-- .slide: background-color="#abcdef" -->\n\n</grid>',
    );
    expect(deck.pages[0].attributes['data-background-color']).toBe('#abcdef');
  });

  it('resolves nested grids from the inside out', async () => {
    const deck = await run(
      '<grid dim="80 80" pos="center" style="background: #eee;">\n<grid dim="50 50" pos="topleft" style="background: red;">inner</grid>\n</grid>',
    );
    const html = deck.pages[0].html;
    expect(html).toContain('width: 80%');
    expect(html).toContain('width: 50%');
    expect(html).toContain('inner');
    expect(html).not.toContain('GRID_');
    // 内层 div 必须落在外层 div 内部
    expect(/<div class="grid"[^>]*>\s*<div class="grid"/.test(html)).toBe(true);
  });

  it('leaves an unmatched grid tag alone instead of looping', async () => {
    const deck = await run('<grid dim="10 10">no closing tag');
    expect(deck.pages[0].html).toContain('no closing tag');
  });

  it('accepts css written as a single string, not just a list', async () => {
    const deck = await run('---\ncss: theme/course.md\n---\n# Hi');
    expect(deck.customCSS).toEqual(['theme/course.md']);
  });

  it('flattens the wikilink-looking form', async () => {
    // YAML 把 [[course]] 解析成 [["course"]]，摊平后才拿得到
    const deck = await run('---\ncss: [[course]]\n---\n# Hi');
    expect(deck.customCSS).toEqual(['course']);
  });

  it('still accepts a list of stylesheets', async () => {
    const deck = await run('---\ncss: [a.css, b.css]\n---\n# Hi');
    expect(deck.customCSS).toEqual(['a.css', 'b.css']);
  });
});
