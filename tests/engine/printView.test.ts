import { describe, it, expect } from 'vitest';
import { isPrintViewSearch } from '../../src/engine/printView';

describe('isPrintViewSearch', () => {
  it('认出打印视图的各种写法', () => {
    expect(isPrintViewSearch('?print-pdf')).toBe(true);
    expect(isPrintViewSearch('print-pdf')).toBe(true);
    expect(isPrintViewSearch('?PRINT-PDF')).toBe(true);
    // reveal 自己也只是在整个 search 里找这个词，混着别的参数一样算
    expect(isPrintViewSearch('?foo=1&print-pdf')).toBe(true);
    expect(isPrintViewSearch('?print-pdf=true')).toBe(true);
  });

  it('普通预览不算打印视图', () => {
    expect(isPrintViewSearch('')).toBe(false);
    expect(isPrintViewSearch('?foo=1')).toBe(false);
    expect(isPrintViewSearch('?print=1')).toBe(false);
    expect(isPrintViewSearch('?pdf')).toBe(false);
  });

  /*
   * 带 g 的正则实例会记住 lastIndex，同一个实例连着 test() 结果会真假交替。
   * 打印视图的判定在一次会话里要被问很多遍（每来一次更新问一次），
   * 一旦跳变就会「更新一次坏一次、下一次又好」，极难查。
   */
  it('反复调用结果稳定', () => {
    const results = Array.from({ length: 5 }, () => isPrintViewSearch('?print-pdf'));
    expect(results).toEqual([true, true, true, true, true]);
  });
});
