import { describe, it, expect } from 'vitest';
import { parseFigureSpec, processFigureBlocks } from '../../src/processors/figureProcessor';

/** Obsidian 渲染 ```figure 之后的产物 */
const block = (json: string): string =>
  `<pre class="language-figure"><code class="language-figure">${json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')}</code></pre>`;

const TIMELINE = '{ "type": "timeline", "nodes": [{ "label": "装初值", "sub": "TH0/TL0" }] }';

describe('parseFigureSpec', () => {
  it('reads a spec', () => {
    expect(parseFigureSpec(TIMELINE)?.type).toBe('timeline');
  });

  it('refuses anything that is not a spec object', () => {
    expect(parseFigureSpec('不是 JSON')).toBeNull();
    expect(parseFigureSpec('[1,2,3]')).toBeNull();
    expect(parseFigureSpec('{"nodes": []}')).toBeNull();   // 没有 type
  });
});

describe('processFigureBlocks', () => {
  it('turns a spec into an image', () => {
    const html = processFigureBlocks(block(TIMELINE));
    expect(html).toContain('<img');
    expect(html).toContain('class="rfo-svg"');
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html).not.toContain('language-figure');
  });

  /*
   * 声明写错时保留原代码块：作者在幻灯片上直接看见自己那段 JSON，
   * 比一个语焉不详的错误框好排查得多。
   */
  it('leaves a broken spec on screen as code', () => {
    const broken = block('{ "type": "timeline", nodes: [] }');   // 键没加引号
    expect(processFigureBlocks(broken)).toContain('language-figure');

    const unknown = block('{ "type": "饼图" }');
    expect(processFigureBlocks(unknown)).toContain('language-figure');
  });

  it('ignores html without a figure block', () => {
    const html = '<pre><code class="language-c">sfr P0 = 0x80;</code></pre>';
    expect(processFigureBlocks(html)).toBe(html);
  });
});
