import { describe, it, expect } from 'vitest';
import { expandCodeLineSpecs } from '../../src/processors/codeLineNumbers';
import { PipelineOrchestrator } from '../../src/processors';
import { DEFAULT_SETTINGS } from '../../src/types/config';

/** 渲染桩：围栏 → <pre><code>（转义 HTML），其余同 Obsidian（删注释、<p dir="auto">） */
const render = async (markdown: string): Promise<string> => {
  const blocks: string[] = [];
  const withFences = markdown.replace(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm, (_m, lang: string, code: string) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cls = lang.trim() ? ` class="language-${lang.trim()}"` : '';
    blocks.push(`<pre${cls}><code${cls}>${escaped}</code></pre>`);
    return `@@BLOCK${blocks.length - 1}@@`;
  });
  const html = withFences
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // 代码块是块级元素，Obsidian 不会把它塞进 <p> —— 独占一段时原样输出
      if (/^@@BLOCK\d+@@$/.test(trimmed)) return trimmed;
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

describe('expandCodeLineSpecs', () => {
  it('turns [2,4-6] into a data-line-numbers directive', () => {
    const out = expandCodeLineSpecs('```c [2,4-6]\nsfr P0 = 0x80;\n```');
    expect(out).toBe('```c\nsfr P0 = 0x80;\n```\n\n<!-- .element: data-line-numbers="2,4-6" -->');
  });

  it('accepts the curly form too', () => {
    const out = expandCodeLineSpecs('```c {2,4-6}\nx\n```');
    expect(out).toContain('data-line-numbers="2,4-6"');
    expect(out).toContain('```c\n');
  });

  /* 竖线分组 = reveal 的分步高亮，每按一次方向键换一组 */
  it('keeps the step delimiter intact', () => {
    const out = expandCodeLineSpecs('```c [1-2|3|4-6]\nx\n```');
    expect(out).toContain('data-line-numbers="1-2|3|4-6"');
  });

  it('drops whitespace inside the spec', () => {
    expect(expandCodeLineSpecs('```c [2, 4 - 6]\nx\n```')).toContain('data-line-numbers="2,4-6"');
  });

  /* 空规格 = 只加行号，不高亮任何行 */
  it('supports an empty spec for line numbers only', () => {
    expect(expandCodeLineSpecs('```c []\nx\n```')).toContain('data-line-numbers=""');
  });

  it('leaves a fence without a spec alone', () => {
    const source = '```c\nsfr P0 = 0x80;\n```';
    expect(expandCodeLineSpecs(source)).toBe(source);
  });

  /* 别的插件的围栏参数不是行号，方括号在那边另有含义，整块放过 */
  it('leaves brackets that are not a line spec alone', () => {
    const source = '```dataview {table: x}\nfoo\n```';
    expect(expandCodeLineSpecs(source)).toBe(source);
  });

  /* 回归：教语法的那一页把 ```c [2] 写在 ````markdown 里当例子，不能被改写 */
  it('leaves an example nested in an outer fence alone', () => {
    const source = '````markdown\n```c [2]\nx\n```\n````';
    expect(expandCodeLineSpecs(source)).toBe(source);
  });

  it('handles several fences on one slide', () => {
    const out = expandCodeLineSpecs('```c [1]\na\n```\n\n文字\n\n```py [2-3]\nb\n```');
    expect(out).toContain('data-line-numbers="1"');
    expect(out).toContain('data-line-numbers="2-3"');
    expect(out).toContain('文字');
  });

  it('returns the text untouched when there is no fence', () => {
    expect(expandCodeLineSpecs('没有代码块')).toBe('没有代码块');
  });
});

describe('end to end: 行号规格落到 <code> 上', () => {
  /*
   * reveal 的 highlight 插件只认 <code> 上的 data-line-numbers；
   * .element 指令本身落在 <pre> 上，转发没做对的话行号会静默不出现。
   */
  it('puts data-line-numbers on <code>, not <pre>', async () => {
    const deck = await run('```c [2,4-6]\na\nb\nc\nd\ne\nf\n```');
    const html = deck.pages[0].html;
    expect(html).toMatch(/<code[^>]*data-line-numbers="2,4-6"/);
    expect(html).not.toMatch(/<pre[^>]*data-line-numbers/);
    expect(html).not.toMatch(/<p[^>]*data-line-numbers/);
  });

  it('works for a code block inside a grid', async () => {
    const deck = await run('<grid dim="50 60" pos="center">\n\n```c [1]\nsfr P0 = 0x80;\n```\n\n</grid>');
    const html = deck.pages[0].html;
    expect(html).toContain('class="grid"');
    expect(html).toMatch(/<code[^>]*data-line-numbers="1"/);
  });

  it('leaves the syntax example on a teaching slide as plain text', async () => {
    const deck = await run('# 用法\n\n````markdown\n```c [2,4-6]\nx\n```\n````');
    const html = deck.pages[0].html;
    expect(html).toContain('```c [2,4-6]');
    expect(html).not.toContain('data-line-numbers');
  });
});
