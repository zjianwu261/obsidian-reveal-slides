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
