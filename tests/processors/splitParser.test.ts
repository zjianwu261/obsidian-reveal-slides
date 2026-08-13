import { describe, it, expect } from 'vitest';
import { parseSplitTags } from '../../src/processors/splitParser';
import { extractNotes } from '../../src/processors/noteProcessor';
import { extractStyleBlocks } from '../../src/processors/cssProcessor';

describe('parseSplitTags', () => {
  it('splits columns on blank lines', () => {
    const { html, splits } = parseSplitTags('<split even gap="2">left col\n\nright col</split>');
    expect(html).toContain('<!--SPLIT_0-->');
    expect(splits[0].columns).toEqual(['left col', 'right col']);
    expect(splits[0].even).toBe(true);
    expect(splits[0].gap).toBe(2);
  });

  it('parses weights and flags', () => {
    const { splits } = parseSplitTags('<split left="2" right="1" no-margin>a\n\nb</split>');
    expect(splits[0].left).toBe(2);
    expect(splits[0].right).toBe(1);
    expect(splits[0].noMargin).toBe(true);
  });
});

describe('extractNotes', () => {
  it('extracts trailing note block', () => {
    const { content, notes } = extractNotes('# Title\n\nnote:\nremember this\nand that', 'note:');
    expect(content).toBe('# Title');
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe('remember this\nand that');
  });

  it('returns empty notes when no separator', () => {
    const { content, notes } = extractNotes('# Title', 'note:');
    expect(content).toBe('# Title');
    expect(notes).toEqual([]);
  });

  it('does not leak notes across slides (per-page execution)', () => {
    // 分页后逐页调用：每页各自处理
    const page1 = extractNotes('page one\nnote: secret', 'note:');
    const page2 = extractNotes('page two', 'note:');
    expect(page1.notes).toHaveLength(1);
    expect(page2.notes).toHaveLength(0);
    expect(page2.content).toBe('page two');
  });
});

describe('extractStyleBlocks', () => {
  it('extracts <style> blocks as document CSS', () => {
    const { body, css } = extractStyleBlocks(
      '# Hi\n\n<style>\n:root { --brand: #f00; }\n</style>\n\ntext',
    );
    expect(body).not.toContain('<style>');
    expect(css).toContain('--brand: #f00;');
  });
});
