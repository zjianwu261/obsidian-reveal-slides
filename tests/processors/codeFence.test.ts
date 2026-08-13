/**
 * 回归：代码块里的插件语法必须原样展示，不能被当成标记解析。
 *
 * 分页器一开始就跳过代码范围，但 grid / split / .element / <style> / note:
 * 五个抽取器都没有 —— 于是「教语法」的那一页会看到：示例消失、真的 grid
 * 浮在页面上、示例 CSS 套到整个 deck、YAML 示例从中间被截断搬进备注。
 */
import { describe, it, expect } from 'vitest';
import { PipelineOrchestrator } from '../../src/processors';
import { parseGridTags } from '../../src/processors/gridParser';
import { parseSplitTags } from '../../src/processors/splitParser';
import { extractElementComments } from '../../src/processors/elementComment';
import { extractStyleBlocks } from '../../src/processors/cssProcessor';
import { extractNotes } from '../../src/processors/noteProcessor';
import { DEFAULT_SETTINGS } from '../../src/types/config';

/** 渲染桩：围栏代码块 → <pre><code>（转义 HTML），其余同 Obsidian（删注释、<p dir="auto">） */
const render = async (markdown: string): Promise<string> => {
  const blocks: string[] = [];
  const withFences = markdown.replace(/^```[^\n]*\n([\s\S]*?)^```[ \t]*$/gm, (_m, code: string) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    blocks.push(`<pre><code>${escaped}</code></pre>`);
    return `@@BLOCK${blocks.length - 1}@@`;
  });
  const html = withFences
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
      return `<p dir="auto">${trimmed.split('\n').join('<br>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
  return html.replace(/@@BLOCK(\d+)@@/g, (_m, n: string) => blocks[Number(n)]);
};

const run = (md: string) =>
  new PipelineOrchestrator().run(md, {
    settings: { ...DEFAULT_SETTINGS },
    sourcePath: 'note.md',
    renderMarkdown: render,
  });

describe('grid / split tags inside code', () => {
  it('leaves a <grid> in a fence alone', () => {
    const source = '```md\n<grid dim="50 50" pos="center">hi</grid>\n```';
    const result = parseGridTags(source);
    expect(result.grids).toHaveLength(0);
    expect(result.html).toBe(source);
  });

  it('leaves a <grid> in inline code alone', () => {
    const result = parseGridTags('写 `<grid dim="50 50" pos="center">x</grid>` 就行');
    expect(result.grids).toHaveLength(0);
  });

  it('still parses a real grid next to a fenced example', () => {
    const result = parseGridTags(
      '```md\n<grid dim="50 50" pos="center">示例</grid>\n```\n\n<grid dim="20 20" pos="topleft">真的</grid>',
    );
    expect(result.grids).toHaveLength(1);
    expect(result.grids[0].children).toBe('真的');
    expect(result.html).toContain('<grid dim="50 50" pos="center">示例</grid>');
  });

  it('leaves a <split> in a fence alone', () => {
    const result = parseSplitTags('```md\n<split even>\na\n\nb\n</split>\n```');
    expect(result.splits).toHaveLength(0);
  });

  it('still parses a real split next to a fenced example', () => {
    const result = parseSplitTags('```md\n<split even>x</split>\n```\n\n<split even>\na\n\nb\n</split>');
    expect(result.splits).toHaveLength(1);
    expect(result.splits[0].columns).toEqual(['a', 'b']);
  });
});

describe('.element / .slide comments inside code', () => {
  it('leaves the comment in a fence alone', () => {
    const source = '```md\n# T<!-- .element: style="color:red" -->\n```';
    const result = extractElementComments(source);
    expect(result.directives).toHaveLength(0);
    expect(result.text).toBe(source);
  });

  it('still extracts a real directive after a fenced example', () => {
    const result = extractElementComments(
      '```md\n<!-- .element: style="color:red" -->\n```\n\n# 标题<!-- .element: style="font-size:100px" -->',
    );
    expect(result.directives).toHaveLength(1);
    expect(result.directives[0].attrs.style).toBe('font-size:100px');
  });
});

describe('<style> blocks inside code', () => {
  it('neither strips nor applies a fenced example', () => {
    const source = '# CSS\n\n```html\n<style>\nbody { color: red }\n</style>\n```';
    const result = extractStyleBlocks(source);
    expect(result.css).toBe('');
    expect(result.body).toBe(source);
  });

  it('still extracts a real style block, keeping the line count', () => {
    const result = extractStyleBlocks('```html\n<style>a{}</style>\n```\n<style>\n:root { --brand: red }\n</style>\nend');
    expect(result.css).toBe(':root { --brand: red }');
    expect(result.body).toContain('<style>a{}</style>');
    expect(result.body.split('\n')).toHaveLength(7);
  });
});

describe('note: separator inside code', () => {
  it('ignores a note: line in a fence', () => {
    const source = '# YAML\n\n```yaml\ntitle: x\nnote: 记得改\nother: y\n```';
    const result = extractNotes(source, 'note:');
    expect(result.notes).toHaveLength(0);
    expect(result.content).toBe(source);
  });

  it('still splits on a real note: after a fenced example', () => {
    const result = extractNotes('```yaml\nnote: 示例\n```\n\nnote: 真的备注', 'note:');
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].content).toBe('真的备注');
    expect(result.content).toContain('note: 示例');
  });
});

describe('end to end: a slide that teaches the syntax', () => {
  it('shows the grid example as code, not as a grid', async () => {
    const deck = await run('# 用法\n\n```md\n<grid dim="50 50" pos="center">内容</grid>\n```');
    const html = deck.pages[0].html;
    expect(html).toContain('&lt;grid dim="50 50" pos="center"&gt;内容&lt;/grid&gt;');
    expect(html).not.toContain('class="grid"');
    expect(html).not.toContain('⟦RFO');
  });

  it('does not let a fenced <style> restyle the deck', async () => {
    const deck = await run('# CSS\n\n```html\n<style>\nbody { color: red }\n</style>\n```');
    expect(deck.cssVariables).toBe('');
    expect(deck.pages[0].html).toContain('body { color: red }');
  });

  it('keeps a YAML sample whole instead of moving half of it into notes', async () => {
    const deck = await run('# YAML\n\n```yaml\ntitle: x\nnote: 记得改\nother: y\n```');
    expect(deck.pages[0].notes).toHaveLength(0);
    expect(deck.pages[0].html).toContain('other: y');
  });
});
