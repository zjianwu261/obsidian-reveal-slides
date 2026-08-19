import { describe, it, expect, beforeEach } from 'vitest';
import { fitCodeBlocks, highlightCodeBlocks } from '../../src/processors/codeBlockProcessor';

/** happy-dom 无布局，用 defineProperty 模拟测量值 */
function mockBox(el: HTMLElement, box: { clientH?: number; clientW?: number; scrollH?: number; scrollW?: number }) {
  Object.defineProperty(el, 'clientHeight', { value: box.clientH ?? 0, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: box.clientW ?? 0, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: box.scrollH ?? 0, configurable: true });
  Object.defineProperty(el, 'scrollWidth', { value: box.scrollW ?? 0, configurable: true });
}

function setup(preHtml: string): { grid: HTMLElement; pre: HTMLElement } {
  document.body.innerHTML = `<div class="grid">${preHtml}</div>`;
  const grid = document.querySelector('.grid') as HTMLElement;
  const pre = grid.querySelector('pre') as HTMLElement;
  return { grid, pre };
}

describe('fitCodeBlocks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps fitting code blocks untouched', () => {
    const { grid, pre } = setup('<pre><code>short</code></pre>');
    mockBox(grid, { clientH: 500, clientW: 500 });
    mockBox(pre, { scrollH: 100, scrollW: 100 });

    fitCodeBlocks(document);
    expect(pre.style.fontSize).toBe('');
    expect(pre.style.transform).toBe('');
  });

  it('shrinks overflowing code down to the minimum font size, then scales', () => {
    const { grid, pre } = setup('<pre style="font-size: 16px;"><code>long</code></pre>');
    // 模拟固定溢出（happy-dom 中改字号不影响 mock 的 scroll 值）
    mockBox(grid, { clientH: 100, clientW: 100 });
    mockBox(pre, { scrollH: 400, scrollW: 50 });

    fitCodeBlocks(document);
    expect(pre.style.fontSize).toBe('10px');
    // scale = min(100/400, 100/50) = 0.25
    expect(pre.style.transform).toBe('scale(0.25)');
    expect(pre.style.transformOrigin).toBe('top left');
  });

  it('ignores pre elements outside .grid', () => {
    document.body.innerHTML = '<pre><code>x</code></pre>';
    const pre = document.querySelector('pre') as HTMLElement;
    mockBox(pre, { scrollH: 400, scrollW: 400 });

    fitCodeBlocks(document);
    expect(pre.style.transform).toBe('');
  });
});

describe('highlightCodeBlocks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  /*
   * reveal 的 highlight 插件只在 initialize() 里跑一遍，重渲染换掉 DOM 之后
   * 新的代码块无人问津 —— 编辑一次预览，整屏代码就没了颜色。
   */
  it('highlights blocks the reveal plugin never saw', () => {
    document.body.innerHTML = '<pre><code class="language-c">sfr P0 = 0x80;</code></pre>';
    const highlighted: HTMLElement[] = [];

    highlightCodeBlocks(document, (block) => highlighted.push(block));

    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].className).toBe('language-c');
    // 插件 init 给 pre 加的类，重渲染后一并补上
    expect(document.querySelector('pre')?.className).toBe('code-wrapper');
  });

  /* 已高亮的块再染一遍，会把上一轮的 <span class="hljs-..."> 当源码重新分词 */
  it('skips blocks hljs already handled', () => {
    document.body.innerHTML =
      '<pre class="code-wrapper"><code class="language-c hljs">x</code></pre>';
    const highlighted: HTMLElement[] = [];

    highlightCodeBlocks(document, (block) => highlighted.push(block));

    expect(highlighted).toHaveLength(0);
  });

  it('leaves <code> outside a <pre> alone', () => {
    document.body.innerHTML = '<p>行内 <code>sfr</code> 不是代码块</p>';
    const highlighted: HTMLElement[] = [];

    highlightCodeBlocks(document, (block) => highlighted.push(block));

    expect(highlighted).toHaveLength(0);
  });
});
