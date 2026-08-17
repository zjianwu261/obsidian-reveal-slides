import { describe, it, expect } from 'vitest';
import { processCodeBlocks } from '../../src/processors/codeHighlight';

/** Obsidian(Prism) 渲染 ```c 的产物 */
const prismBlock =
  '<pre class="language-c"><code class="language-c is-loaded">' +
  '<span class="token comment">// SFR声明</span>\n' +
  'sfr P0 <span class="token operator">=</span> <span class="token number">0x80</span>' +
  '<span class="token punctuation">;</span>' +
  '</code></pre>';

describe('processCodeBlocks', () => {
  it('strips Prism markup down to the code itself', () => {
    const html = processCodeBlocks(prismBlock);
    expect(html).not.toContain('token comment');
    expect(html).not.toContain('<span');
    expect(html).toContain('// SFR声明\nsfr P0 = 0x80;');
  });

  it('keeps the language class so highlight.js knows what to highlight', () => {
    expect(processCodeBlocks(prismBlock)).toContain('class="language-c is-loaded"');
  });

  /*
   * reveal 的 highlight 插件在高亮前会把 code 的 innerHTML 里的 < > 转义一遍，
   * 除非挂了 data-noescape。不挂的话 `#include <reg52.h>` 会显示成 #include &lt;reg52.h&gt;。
   */
  it('marks the block so reveal does not escape it a second time', () => {
    const html = processCodeBlocks('<pre><code class="language-c">#include &lt;reg52.h&gt;</code></pre>');
    expect(html).toContain('data-noescape');
    expect(html).toContain('#include &lt;reg52.h&gt;');
    expect(html).not.toContain('&amp;lt;');
  });

  it('drops the copy button Obsidian injects', () => {
    const html = processCodeBlocks(
      '<pre><code class="language-c">x</code><button class="copy-code-button">复制</button></pre>',
    );
    expect(html).not.toContain('copy-code-button');
  });

  it('leaves mermaid / chart / svg blocks to their own processors', () => {
    const mermaid = '<pre><code class="language-mermaid">graph LR\nA--&gt;B</code></pre>';
    expect(processCodeBlocks(mermaid)).toBe(mermaid);
  });

  it('returns the html untouched when there is no code block', () => {
    const html = '<p>没有代码</p>';
    expect(processCodeBlocks(html)).toBe(html);
  });
});
