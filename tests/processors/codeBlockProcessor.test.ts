import { describe, it, expect, beforeEach } from 'vitest';
import { fitCodeBlocks } from '../../src/processors/codeBlockProcessor';

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
