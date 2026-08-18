import { describe, it, expect } from 'vitest';
import { parseGridTags, normalizePosition, resolvePosition } from '../../src/processors/gridParser';
import { gridPlaceholder } from '../../src/constants';

describe('normalizePosition', () => {
  it('numeric pair → percentages', () => {
    expect(normalizePosition('20 25')).toEqual(['20%', '25%']);
  });

  it('single keyword centers the other axis', () => {
    expect(normalizePosition('top')).toEqual(['50%', '0%']);
    expect(normalizePosition('bottom')).toEqual(['50%', '100%']);
    expect(normalizePosition('left')).toEqual(['0%', '50%']);
    expect(normalizePosition('right')).toEqual(['100%', '50%']);
    expect(normalizePosition('center')).toEqual(['50%', '50%']);
  });

  it('corner keywords', () => {
    expect(normalizePosition('topleft')).toEqual(['0%', '0%']);
    expect(normalizePosition('topright')).toEqual(['100%', '0%']);
    expect(normalizePosition('bottomleft')).toEqual(['0%', '100%']);
    expect(normalizePosition('bottomright')).toEqual(['100%', '100%']);
  });

  it('negative numbers → calc()', () => {
    expect(normalizePosition('-6 -8')).toEqual(['calc(100% - 6%)', 'calc(100% - 8%)']);
  });

  it('keyword pairs', () => {
    expect(normalizePosition('left top')).toEqual(['0%', '0%']);
    expect(normalizePosition('right bottom')).toEqual(['100%', '100%']);
  });
});

describe('resolvePosition anchors', () => {
  it('numeric positions anchor at the top-left corner', () => {
    expect(resolvePosition('20 25').anchor).toEqual(['0', '0']);
  });

  it('keywords pull the element back by the same percentage', () => {
    expect(resolvePosition('center').anchor).toEqual(['-50%', '-50%']);
    expect(resolvePosition('bottomright').anchor).toEqual(['-100%', '-100%']);
    expect(resolvePosition('topleft').anchor).toEqual(['0', '0']);
    expect(resolvePosition('top').anchor).toEqual(['-50%', '0']);
    expect(resolvePosition('left top').anchor).toEqual(['0', '0']);
  });

  it('negative numbers anchor at the far edge', () => {
    expect(resolvePosition('-6 -8').anchor).toEqual(['-100%', '-100%']);
  });

  it('non-numeric tokens fall back to 0 instead of NaN', () => {
    expect(resolvePosition('20% 25%').position).toEqual(['0%', '0%']);
  });
});

describe('parseGridTags', () => {
  it('parses a grid into placeholder + element', () => {
    const { html, grids } = parseGridTags(
      'before\n<grid dim="60 30" pos="20 25" style="background: red;">**bold**</grid>\nafter',
    );
    expect(html).toContain(gridPlaceholder(0));
    expect(grids).toHaveLength(1);
    expect(grids[0].dimension).toEqual([60, 30]);
    expect(grids[0].position).toEqual(['20%', '25%']);
    expect(grids[0].style).toBe('background: red;');
    expect(grids[0].children).toBe('**bold**');
  });

  it('parses multiple grids with increasing indexes', () => {
    const { html, grids } = parseGridTags(
      '<grid dim="10 10" pos="top">a</grid>\n<grid dim="20 20" pos="bottom">b</grid>',
    );
    expect(html).toContain(gridPlaceholder(0));
    expect(html).toContain(gridPlaceholder(1));
    expect(grids[1].position).toEqual(['50%', '100%']);
  });

  it('parses class / shape / frag / animate attributes', () => {
    const { grids } = parseGridTags(
      '<grid dim="100 50" pos="10 10" class="box hl" shape="hexagon" frag="2" animate="fade-in">x</grid>',
    );
    const grid = grids[0];
    expect(grid.position).toEqual(['10%', '10%']);
    expect(grid.className).toBe('box hl');
    expect(grid.shape).toBe('hexagon');
    expect(grid.fragment).toBe('2');
    expect(grid.animate).toBe('fade-in');
  });

  it('defaults position to center and dimension to 100x100', () => {
    const { grids } = parseGridTags('<grid>x</grid>');
    expect(grids[0].position).toEqual(['50%', '50%']);
    expect(grids[0].dimension).toEqual([100, 100]);
  });

  it('accepts dim / pos short form', () => {
    const { grids } = parseGridTags('<grid dim="22 12" pos="6 7">x</grid>');
    expect(grids[0].dimension).toEqual([22, 12]);
    expect(grids[0].position).toEqual(['6%', '7%']);
  });

  /*
   * dimension / position（完整写法）与 drag / drop（advanced-slides 写法）都已作废：
   * 一件事四种拼法，补全面板刷屏、文档处处并列、示例互相打架。
   * 写这些名字的 grid 按「没写尺寸位置」处理 —— 拿默认值，而不是把它们当 dim/pos。
   */
  it('no longer honours the old spellings', () => {
    const { grids } = parseGridTags(
      '<grid dimension="40 30" position="10 15">a</grid>' +
        '<grid drag="40 30" drop="10 15">b</grid>',
    );
    for (const grid of grids) {
      expect(grid.dimension).toEqual([100, 100]);
      expect(grid.position).toEqual(['50%', '50%']);
    }
  });

  it('supports keyword and negative pos values', () => {
    const { grids } = parseGridTags(
      '<grid dim="100 12" pos="top">a</grid><grid dim="40 7" pos="-6 -8">b</grid>',
    );
    expect(grids[0].position).toEqual(['50%', '0%']);
    expect(grids[0].anchor).toEqual(['-50%', '0']);
    expect(grids[1].position).toEqual(['calc(100% - 6%)', 'calc(100% - 8%)']);
  });

  it('parses an empty grid used as a background bar', () => {
    const { grids } = parseGridTags('<grid dim="100 11" pos="0 85" style="background:#eee"></grid>');
    expect(grids).toHaveLength(1);
    expect(grids[0].children).toBe('');
    expect(grids[0].style).toBe('background:#eee');
  });
});
