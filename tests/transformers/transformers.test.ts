import { describe, it, expect } from 'vitest';
import { GridTransformer } from '../../src/transformers/grid';
import { ShapeTransformer, SHAPE_CLIP_PATHS } from '../../src/transformers/shape';
import { StyleTransformer } from '../../src/transformers/style';
import { ClassTransformer } from '../../src/transformers/class';
import { FragmentTransformer } from '../../src/transformers/fragment';
import { AnimateTransformer } from '../../src/transformers/animate';
import { normalizeSlideAttributes } from '../../src/transformers/backgroundImage';
import { renderGridHtml, renderSplitHtml, type TransformerResult } from '../../src/transformers';
import type { GridElement } from '../../src/types/grid';

function makeGrid(overrides: Partial<GridElement> = {}): GridElement {
  return {
    tag: 'grid',
    dimension: [60, 30],
    position: ['20%', '25%'],
    anchor: ['0', '0'],
    style: '',
    className: '',
    shape: null,
    fragment: null,
    animate: null,
    children: '<p>x</p>',
    ...overrides,
  };
}

function fresh(): TransformerResult {
  return { css: [], classes: [], attrs: {} };
}

describe('GridTransformer', () => {
  it('emits absolute positioning css', () => {
    const result = fresh();
    new GridTransformer().transform(makeGrid(), result);
    expect(result.css.join(' ')).toBe(
      'position: absolute; width: 60%; height: 30%; left: 20%; top: 25%;',
    );
  });

  it('passes normalized calc() positions through', () => {
    const result = fresh();
    new GridTransformer().transform(
      makeGrid({ position: ['calc(100% - 6%)', 'calc(100% - 8%)'], anchor: ['-100%', '-100%'] }),
      result,
    );
    expect(result.css.join(' ')).toContain('left: calc(100% - 6%);');
  });

  it('translates the element back for keyword / negative positions', () => {
    const result = fresh();
    new GridTransformer().transform(
      makeGrid({ position: ['100%', '100%'], anchor: ['-100%', '-100%'] }),
      result,
    );
    expect(result.css.join(' ')).toContain('transform: translate(-100%, -100%);');
  });

  it('exposes the box for the grid guides overlay', () => {
    const result = fresh();
    new GridTransformer().transform(makeGrid(), result);
    expect(result.attrs['data-rfo-box']).toBe('60×30% @ 20% 25%');
  });

  it('omits the transform when the element anchors at its top-left corner', () => {
    const result = fresh();
    new GridTransformer().transform(makeGrid(), result);
    expect(result.css.join(' ')).not.toContain('transform');
  });
});

describe('ShapeTransformer', () => {
  it('maps known shapes to clip-path', () => {
    const result = fresh();
    new ShapeTransformer().transform(makeGrid({ shape: 'hexagon' }), result);
    expect(result.css.join(' ')).toBe(`clip-path: ${SHAPE_CLIP_PATHS.hexagon};`);
  });

  it('has all 12 built-in shapes', () => {
    expect(Object.keys(SHAPE_CLIP_PATHS)).toHaveLength(12);
  });

  it('passes unknown values through raw', () => {
    const result = fresh();
    new ShapeTransformer().transform(makeGrid({ shape: 'polygon(0 0, 100% 0, 50% 100%)' }), result);
    expect(result.css.join(' ')).toContain('clip-path: polygon(0 0, 100% 0, 50% 100%);');
  });
});

describe('Style/Class/Fragment/Animate transformers', () => {
  it('style passthrough', () => {
    const result = fresh();
    new StyleTransformer().transform(makeGrid({ style: 'background: red' }), result);
    expect(result.css.join(' ')).toBe('background: red;');
  });

  it('class splitting', () => {
    const result = fresh();
    new ClassTransformer().transform(makeGrid({ className: 'a  b' }), result);
    expect(result.classes).toEqual(['a', 'b']);
  });

  it('frag numeric → data-fragment-index', () => {
    const result = fresh();
    new FragmentTransformer().transform(makeGrid({ fragment: '1' }), result);
    expect(result.classes).toContain('fragment');
    expect(result.attrs['data-fragment-index']).toBe('1');
  });

  it('frag animation name → fragment + animation class', () => {
    const result = fresh();
    new FragmentTransformer().transform(makeGrid({ fragment: 'fade-up' }), result);
    expect(result.classes).toEqual(['fragment', 'fade-up']);
  });

  it('animate → animate.css classes', () => {
    const result = fresh();
    new AnimateTransformer().transform(makeGrid({ animate: 'fade-in' }), result);
    expect(result.classes).toEqual(['animate__animated', 'animate__fade-in']);
  });
});

describe('normalizeSlideAttributes', () => {
  it('maps background keys to data-background-*', () => {
    expect(
      normalizeSlideAttributes({ 'background-color': '#fff', 'background-size': 'cover' }),
    ).toEqual({ 'data-background-color': '#fff', 'data-background-size': 'cover' });
  });
});

describe('renderGridHtml / renderSplitHtml', () => {
  it('composes the final grid div', () => {
    const html = renderGridHtml(
      makeGrid({ style: 'background: red;', className: 'box', children: '<p>hi</p>' }),
    );
    expect(html).toContain('class="grid box"');
    expect(html).toContain('position: absolute;');
    expect(html).toContain('background: red;');
    expect(html).toContain('<p>hi</p>');
  });

  it('renders even split with gap', () => {
    const html = renderSplitHtml({
      tag: 'split',
      even: true,
      gap: 2,
      left: 1,
      right: 1,
      wrap: null,
      noMargin: false,
      columns: ['<p>a</p>', '<p>b</p>'],
    });
    expect(html).toContain('gap: 2em');
    expect(html.match(/flex: 1/g)).toHaveLength(2);
  });

  it('renders weighted split', () => {
    const html = renderSplitHtml({
      tag: 'split',
      even: false,
      gap: 0,
      left: 2,
      right: 1,
      wrap: null,
      noMargin: true,
      columns: ['<p>a</p>', '<p>b</p>'],
    });
    expect(html).toContain('flex: 2');
    expect(html).toContain('split-no-margin');
  });
});
