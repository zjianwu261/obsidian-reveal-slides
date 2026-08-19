/**
 * 回归：代码块里的插件语法必须原样展示，不能被当成标记解析。
 *
 * 分页器一开始就跳过代码范围，但 grid / .element / <style> / note:
 * 四个抽取器都没有 —— 于是「教语法」的那一页会看到：示例消失、真的 grid
 * 浮在页面上、示例 CSS 套到整个 deck、YAML 示例从中间被截断搬进备注。
 */
import { describe, it, expect } from 'vitest';
import { PipelineOrchestrator } from '../../src/processors';
import { parseGridTags } from '../../src/processors/gridParser';
import { extractElementComments } from '../../src/processors/elementComment';
import { extractStyleBlocks } from '../../src/processors/cssProcessor';
import { extractNotes } from '../../src/processors/noteProcessor';
import { DEFAULT_SETTINGS } from '../../src/types/config';

/** 渲染桩：围栏代码块 → <pre><code>（转义 HTML），其余同 Obsidian（删注释、<p dir="auto">） */
const render = async (markdown: string): Promise<string> => {
  const blocks: string[] = [];
  const withFences = markdown.replace(
    /^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm,
    (_m, lang: string, code: string) => {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Obsidian 会把语言标记落成 class="language-xxx"，图表类处理器全靠它认领代码块
      const cls = lang.trim() ? ` class="language-${lang.trim()}"` : '';
      blocks.push(`<pre${cls}><code${cls}>${escaped}</code></pre>`);
      return `@@BLOCK${blocks.length - 1}@@`;
    },
  );
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

describe('grid tags inside code', () => {
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

  /*
   * 回归：「代码块 + 行内代码 + note: + xxx」是课件里最常见的一页。
   * 行内代码一旦配对错位，note: 与 xxx 双双被当成代码：讲稿整段留在正文、该分的页不分，
   * 几页内容叠在同一张画布上。
   */
  it('keeps notes and page breaks working when inline code follows a fence', async () => {
    const deck = await run(
      '```c\nsfr P0 = 0x80;\n```\n\n- `sfr` 声明字节\n- `sbit` 声明位\n- 例：`sbit LED = P0^0;`\n\n' +
        'note:\n\n各位同学大家好，`sfr` 是关键字\n\nxxx\n\n# 下一页',
    );
    expect(deck.pages).toHaveLength(2);
    expect(deck.pages[0].notes[0].content).toContain('各位同学大家好');
    expect(deck.pages[0].html).not.toContain('各位同学大家好');
    expect(deck.pages[1].html).toContain('下一页');
  });

  /*
   * 回归：正文里打漏一个反引号（真实案例：写 `"51单片机"泛指针` 时少打了收尾那个）。
   * 它曾跟后面老远的另一个反引号配成一对，把中间的 xxx、note: 全吞进「代码」，
   * 整篇课件叠成一张。
   */
  it('survives a stray backtick in the prose', async () => {
    const deck = await run(
      '## 认识51单片机\n\n"51单片机"泛指针`兼容8051指令系统的所有芯片。\n\n' +
        'note:\n\n讲稿里也有 `sfr` 这种行内代码\n\nxxx\n\n# 下一页',
    );
    expect(deck.pages).toHaveLength(2);
    expect(deck.pages[0].notes[0].content).toContain('讲稿里也有');
    expect(deck.pages[0].html).not.toContain('讲稿里也有');
  });

  it('renders a ```figure block into an image, not a code block', async () => {
    const deck = await run(
      '# 定时器\n\n```figure\n{ "type": "timeline", "nodes": [{ "label": "装初值" }] }\n```',
    );
    const html = deck.pages[0].html;
    expect(html).toContain('class="rfo-svg"');
    expect(html).not.toContain('language-figure');

    // 图是 data URI，文字在编码后的 SVG 里（与 ```svg 块同一条路）
    const svg = Buffer.from(
      /base64,([^"]+)/.exec(html)?.[1] ?? '',
      'base64',
    ).toString('utf8');
    expect(svg).toContain('装初值');
  });

  it('keeps a YAML sample whole instead of moving half of it into notes', async () => {
    const deck = await run('# YAML\n\n```yaml\ntitle: x\nnote: 记得改\nother: y\n```');
    expect(deck.pages[0].notes).toHaveLength(0);
    expect(deck.pages[0].html).toContain('other: y');
  });
});
