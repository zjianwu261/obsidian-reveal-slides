import { describe, it, expect } from 'vitest';
import { processSlideEmbeds } from '../../src/processors/embedProcessor';
import { PipelineOrchestrator } from '../../src/processors';
import { DEFAULT_SETTINGS } from '../../src/types/config';

/** 极简 Markdown 渲染桩：标题与段落 */
const fakeRender = async (markdown: string): Promise<string> => {
  return markdown
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
      return `<p>${trimmed}</p>`;
    })
    .filter(Boolean)
    .join('\n');
};

const pipeline = new PipelineOrchestrator();
const run = (md: string, readNote?: (path: string) => Promise<string | null>) =>
  pipeline.run(md, {
    settings: { ...DEFAULT_SETTINGS },
    sourcePath: 'test.md',
    renderMarkdown: fakeRender,
    readNote,
  });

describe('processSlideEmbeds (unit)', () => {
  it('keeps the block when readNote is not provided', async () => {
    const content = '```slide\nnote: other\n```';
    expect(await processSlideEmbeds(content, {})).toBe(content);
  });

  it('replaces the block with the requested page html', async () => {
    const out = await processSlideEmbeds('```slide\nnote: other\npage: 2\n```', {
      readNote: async () => '# A',
      renderNotePages: async () => ['<h1>p1</h1>', '<h1>p2</h1>'],
    });
    expect(out).toBe('<h1>p2</h1>');
  });

  it('rejects invalid directives with a hint', async () => {
    const out = await processSlideEmbeds('```slide\npage: 1\n```', {
      readNote: async () => '# A',
      renderNotePages: async () => ['x'],
    });
    expect(out).toContain('指令非法');
  });
});

describe('slide embed (pipeline)', () => {
  it('embeds the first page by default', async () => {
    const deck = await run(
      '# Main\n\n```slide\nnote: other\n```',
      async () => '# Sub page 1\n---\n# Sub page 2',
    );
    expect(deck.pages[0].html).toContain('<h1>Sub page 1</h1>');
    expect(deck.pages[0].html).not.toContain('Sub page 2');
    expect(deck.pages[0].html).not.toContain('```slide');
  });

  it('embeds the requested page', async () => {
    const deck = await run(
      '```slide\nnote: other\npage: 2\n```',
      async () => '# Sub page 1\n---\n# Sub page 2',
    );
    expect(deck.pages[0].html).toContain('<h1>Sub page 2</h1>');
  });

  it('shows a hint when the note does not exist', async () => {
    const deck = await run('```slide\nnote: missing\n```', async () => null);
    expect(deck.pages[0].html).toContain('找不到笔记');
    expect(deck.pages[0].html).toContain('missing');
  });

  it('shows a hint when the page is out of range', async () => {
    const deck = await run(
      '```slide\nnote: other\npage: 9\n```',
      async () => '# Only one page',
    );
    expect(deck.pages[0].html).toContain('没有第 9 页');
  });

  it('guards against circular embeds via depth limit', async () => {
    const notes: Record<string, string> = {
      a: '# A\n\n```slide\nnote: b\n```',
      b: '# B\n\n```slide\nnote: a\n```',
    };
    const deck = await run(notes.a, async (path) => notes[path] ?? null);
    // 不无限递归；最深层嵌入处替换为深度提示
    expect(deck.pages[0].html).toContain('<h1>B</h1>');
    expect(deck.pages[0].html).toContain('嵌入深度');
  });
});
