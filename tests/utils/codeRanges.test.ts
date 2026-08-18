import { describe, it, expect } from 'vitest';
import { findCodeRanges, isInsideCode, replaceOutsideCode } from '../../src/utils/codeRanges';

describe('findCodeRanges', () => {
  it('marks a fenced block', () => {
    const text = 'a\n```js\nlet x = 1\n```\nb';
    const ranges = findCodeRanges(text);
    expect(ranges).toHaveLength(1);
    expect(isInsideCode(text.indexOf('let x'), ranges)).toBe(true);
    expect(isInsideCode(text.indexOf('b'), ranges)).toBe(false);
  });

  it('marks ~~~ fences and inline code', () => {
    const text = '~~~\nraw\n~~~\nsee `inline` here';
    const ranges = findCodeRanges(text);
    expect(isInsideCode(text.indexOf('raw'), ranges)).toBe(true);
    expect(isInsideCode(text.indexOf('inline'), ranges)).toBe(true);
    expect(isInsideCode(text.indexOf('here'), ranges)).toBe(false);
  });

  it('treats an unterminated fence as running to the end', () => {
    const text = 'intro\n```\nnever closed';
    expect(isInsideCode(text.indexOf('never'), findCodeRanges(text))).toBe(true);
  });

  it('does not double-count backticks inside a fence', () => {
    const text = '```\n`a` `b`\n```';
    expect(findCodeRanges(text)).toHaveLength(1);
  });

  /*
   * 回归：围栏块之后的行内代码必须照旧成对。
   * 收尾的 ``` 曾拉出一个伪匹配吃掉围栏后第一个反引号，此后每对反引号都配错位，
   * 「行内代码」落到真行内代码之间的空隙上 —— 空隙里的 note: / xxx / --- 被当成
   * 代码跳过，于是备注混进正文、几页内容叠在一张画布上。
   */
  it('keeps inline pairing intact after a fenced block', () => {
    const text = '```c\nsfr P0 = 0x80;\n```\n\n- `sfr` 声明字节，`sbit` 声明位\n\nnote:\n\n讲稿';
    const ranges = findCodeRanges(text);

    expect(isInsideCode(text.indexOf('sfr P0'), ranges)).toBe(true);
    expect(isInsideCode(text.indexOf('`sfr`') + 1, ranges)).toBe(true);
    expect(isInsideCode(text.indexOf('`sbit`') + 1, ranges)).toBe(true);
    // 两段行内代码之间的空隙，以及后面的 note:，都不是代码
    expect(isInsideCode(text.indexOf(' 声明字节，'), ranges)).toBe(false);
    expect(isInsideCode(text.indexOf('note:'), ranges)).toBe(false);
  });

  /*
   * 回归：正文里打漏一个反引号（真实案例：`"51单片机"泛指针`兼容8051指令系统的所有芯片）。
   * 放任它跨段配对的话，它会跟老远之后的另一个反引号凑成一对，把中间整片文字
   * 连同 note: / xxx / --- 一起标成「代码」，于是半篇课件叠成一张。
   */
  it('confines a stray backtick to its own paragraph', () => {
    const text = [
      '## 认识51单片机',
      '',
      '"51单片机"泛指针`兼容8051指令系统的所有芯片。',
      '',
      'note:',
      '',
      '讲稿里也会写 `sfr` 这样的行内代码。',
      '',
      'xxx',
      '',
      '# 下一页',
    ].join('\n');
    const ranges = findCodeRanges(text);

    expect(isInsideCode(text.indexOf('note:'), ranges)).toBe(false);
    expect(isInsideCode(text.indexOf('xxx'), ranges)).toBe(false);
    // 落单的那一个不成对，自己也不算代码
    expect(isInsideCode(text.indexOf('兼容8051'), ranges)).toBe(false);
    // 后面正常成对的行内代码照常识别
    expect(isInsideCode(text.indexOf('`sfr`') + 1, ranges)).toBe(true);
  });

  it('does not let inline code span a blank line', () => {
    const text = 'a `code\nstill code` b\n\nc `x` d';
    const ranges = findCodeRanges(text);

    // 段内换行仍算一段行内代码
    expect(isInsideCode(text.indexOf('still'), ranges)).toBe(true);
    // 空行之后重新开始配对
    expect(isInsideCode(text.indexOf('c `x`'), ranges)).toBe(false);
    expect(isInsideCode(text.indexOf('`x`') + 1, ranges)).toBe(true);
  });
});

describe('replaceOutsideCode', () => {
  it('skips matches that start inside code, replaces the rest', () => {
    const text = 'X\n```\nX\n```\nX';
    expect(replaceOutsideCode(text, /X/g, () => 'Y')).toBe('Y\n```\nX\n```\nY');
  });

  it('passes capture groups through in order', () => {
    const seen: (string | undefined)[][] = [];
    replaceOutsideCode('a=1 b=2', /(\w)=(\d)/g, (whole, key, value) => {
      seen.push([whole, key, value]);
      return '';
    });
    expect(seen).toEqual([
      ['a=1', 'a', '1'],
      ['b=2', 'b', '2'],
    ]);
  });

  it('keeps optional groups undefined rather than shifting them', () => {
    const seen: (string | undefined)[][] = [];
    replaceOutsideCode('<t>', /<t(?:\s+(x))?>/g, (whole, attr) => {
      seen.push([whole, attr]);
      return '';
    });
    expect(seen).toEqual([['<t>', undefined]]);
  });

  it('behaves like plain replace when there is no code at all', () => {
    expect(replaceOutsideCode('a a', /a/g, () => 'b')).toBe('b b');
  });
});
