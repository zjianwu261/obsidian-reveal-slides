import { describe, it, expect } from 'vitest';
import { parseGridTags, normalizePosition } from '../../src/processors/gridParser';

describe('normalizePosition', () => {
  it('numeric pair → percentages', () => {
    expect(normalizePosition('20 25', false)).toEqual(['20%', '25%']);
  });

  it('numeric pair with absolute → px', () => {
    expect(normalizePosition('200 150', true)).toEqual(['200px', '150px']);
  });

  it('single keyword centers the other axis', () => {
    expect(normalizePosition('top', false)).toEqual(['50%', '0%']);
    expect(normalizePosition('bottom', false)).toEqual(['50%', '100%']);
    expect(normalizePosition('left', false)).toEqual(['0%', '50%']);
    expect(normalizePosition('right', false)).toEqual(['100%', '50%']);
    expect(normalizePosition('center', false)).toEqual(['50%', '50%']);
  });

  it('corner keywords', () => {
    expect(normalizePosition('topleft', false)).toEqual(['0%', '0%']);
    expect(normalizePosition('topright', false)).toEqual(['100%', '0%']);
    expect(normalizePosition('bottomleft', false)).toEqual(['0%', '100%']);
    expect(normalizePosition('bottomright', false)).toEqual(['100%', '100%']);
  });

  it('negative numbers → calc()', () => {
    expect(normalizePosition('-6 -8', false)).toEqual(['calc(100% - 6%)', 'calc(100% - 8%)']);
    expect(normalizePosition('-60 -80', true)).toEqual(['calc(100% - 60px)', 'calc(100% - 80px)']);
  });

  it('keyword pairs', () => {
    expect(normalizePosition('left top', false)).toEqual(['0%', '0%']);
    expect(normalizePosition('right bottom', false)).toEqual(['100%', '100%']);
  });
});

describe('parseGridTags', () => {
  it('parses a grid into placeholder + element', () => {
    const { html, grids } = parseGridTags(
      'before\n<grid dimension="60 30" position="20 25" style="background: red;">**bold**</grid>\nafter',
    );
    expect(html).toContain('<!--GRID_0-->');
    expect(grids).toHaveLength(1);
    expect(grids[0].dimension).toEqual([60, 30]);
    expect(grids[0].position).toEqual(['20%', '25%']);
    expect(grids[0].style).toBe('background: red;');
    expect(grids[0].children).toBe('**bold**');
  });

  it('parses multiple grids with increasing indexes', () => {
    const { html, grids } = parseGridTags(
      '<grid dimension="10 10" position="top">a</grid>\n<grid dimension="20 20" position="bottom">b</grid>',
    );
    expect(html).toContain('<!--GRID_0-->');
    expect(html).toContain('<!--GRID_1-->');
    expect(grids[1].position).toEqual(['50%', '100%']);
  });

  it('parses absolute / class / shape / frag / animate attributes', () => {
    const { grids } = parseGridTags(
      '<grid dimension="100 50" position="10 10" absolute class="box hl" shape="hexagon" frag="2" animate="fade-in">x</grid>',
    );
    const grid = grids[0];
    expect(grid.absolute).toBe(true);
    expect(grid.position).toEqual(['10px', '10px']);
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
});
