import { describe, it, expect } from 'vitest';
import { processMermaidBlocks } from '../../src/processors/mermaidProcessor';

const MERMAID = 'graph TD\n  A-->B';
const ESCAPED = MERMAID.replace(/-->/g, '--&gt;');

describe('processMermaidBlocks', () => {
  it('converts a language-mermaid code block into an rfo-mermaid div', () => {
    const out = processMermaidBlocks(`<pre><code class="language-mermaid">${ESCAPED}</code></pre>`);
    expect(out).toContain('class="rfo-mermaid"');
    expect(out).not.toContain('<pre>');
    // 源码经反转义后应完整保留（序列化时重新转义）
    const div = /<div class="rfo-mermaid">([\s\S]*?)<\/div>/.exec(out)?.[1];
    expect(div).toBeTruthy();
    const doc = new DOMParser().parseFromString(`<div>${div}</div>`, 'text/html');
    expect(doc.body.firstElementChild!.textContent).toBe(MERMAID);
  });

  it('matches loosely when class carries extra markers', () => {
    const out = processMermaidBlocks(
      `<pre><code class="language-mermaid is-loaded">${ESCAPED}</code></pre>`,
    );
    expect(out).toContain('class="rfo-mermaid"');
  });

  it('keeps empty mermaid blocks untouched', () => {
    const html = '<pre><code class="language-mermaid">  </code></pre>';
    expect(processMermaidBlocks(html)).toContain('<pre>');
  });

  it('leaves other language code blocks untouched', () => {
    const html = '<pre><code class="language-js">const a = 1;</code></pre>';
    expect(processMermaidBlocks(html)).toContain('language-js');
  });
});
