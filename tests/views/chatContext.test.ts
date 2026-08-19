import { describe, it, expect } from 'vitest';
import { formatContext, pageTitle } from '../../src/views/chatContext';

describe('pageTitle', () => {
  it('takes the first heading on the page', () => {
    expect(pageTitle('<grid dim="100 10" pos="top" class="bar">\n## 算术运算符\n</grid>')).toBe('算术运算符');
  });

  it('is empty when the page has no heading', () => {
    expect(pageTitle('<grid dim="50 50" pos="center">just text</grid>')).toBe('');
  });

  /* 代码块里的 # 是注释、井号标题的伪装，别当成标题 —— 取第一个真标题即可 */
  it('takes the first one, not the deepest', () => {
    expect(pageTitle('# 第一\n\n## 第二')).toBe('第一');
  });
});

describe('formatContext', () => {
  it('lines up note, page and title', () => {
    expect(formatContext({ note: '课件第4章', page: '2.6', title: '自增和自减' })).toBe(
      '课件第4章  ·  第 2.6 页  ·  自增和自减',
    );
  });

  it('drops the title when there is none', () => {
    expect(formatContext({ note: '课件第4章', page: '1.0', title: '' })).toBe('课件第4章  ·  第 1.0 页');
  });

  it('says so when there is nothing to edit', () => {
    expect(formatContext(null)).toBe('还没有可改的页面');
  });
});
