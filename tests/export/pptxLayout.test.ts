import { describe, it, expect } from 'vitest';
import { layoutRegions } from '../../src/export/pptxLayout';
import type { LayoutOptions } from '../../src/export/pptxLayout';
import type { OutlinePara, OutlineRegion } from '../../src/export/slideOutline';

const OPTIONS: LayoutOptions = {
  canvas: { width: 1920, height: 1080 },
  rootFontSize: 40,
  imageSize: () => null,
};

function para(text: string, size = 1): OutlinePara {
  return { runs: [{ text, size }], size, indent: -1, ordered: false, align: 'l' };
}

function region(blocks: OutlineRegion['blocks'], overrides: Partial<OutlineRegion> = {}): OutlineRegion {
  return { box: { x: 0, y: 0, w: 1, h: 1 }, blocks, center: false, ...overrides };
}

describe('layoutRegions', () => {
  it('maps region fractions onto canvas pixels', () => {
    const shapes = layoutRegions(
      [region([{ kind: 'text', paragraphs: [para('x')] }], { box: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 } })],
      OPTIONS,
    );
    expect(shapes[0].box.x).toBe(480);
    expect(shapes[0].box.w).toBe(960);
  });

  it('stacks blocks top-down without overlapping', () => {
    const shapes = layoutRegions(
      [
        region([
          { kind: 'text', paragraphs: [para('第一块')] },
          { kind: 'text', paragraphs: [para('第二块')] },
        ]),
      ],
      OPTIONS,
    );

    expect(shapes).toHaveLength(2);
    expect(shapes[1].box.y).toBeGreaterThanOrEqual(shapes[0].box.y + shapes[0].box.h);
  });

  it('centers the stack vertically when the region asks for it', () => {
    const blocks = [{ kind: 'text' as const, paragraphs: [para('居中')] }];
    const top = layoutRegions([region(blocks)], OPTIONS)[0];
    const centered = layoutRegions([region(blocks, { center: true })], OPTIONS)[0];

    expect(top.box.y).toBe(0);
    expect(centered.box.y).toBeGreaterThan(0);
    // 上下留白应大致相等
    expect(centered.box.y).toBeCloseTo(1080 - centered.box.y - centered.box.h, 0);
  });

  it('squeezes the stack back inside a region that would overflow', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      kind: 'text' as const,
      paragraphs: [para(`第 ${i} 行`)],
    }));
    const shapes = layoutRegions([region(many, { box: { x: 0, y: 0, w: 1, h: 0.3 } })], OPTIONS);
    const last = shapes[shapes.length - 1];

    expect(last.box.y + last.box.h).toBeLessThanOrEqual(0.3 * 1080 + 1);
  });

  it('hands the squeeze factor to every shape it shrank', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      kind: 'text' as const,
      paragraphs: [para(`第 ${i} 行`)],
    }));
    const shapes = layoutRegions(
      [region([...many, { kind: 'table', rows: [[{ runs: [{ text: '格', size: 1 }], header: false, align: null }]], size: 1 }],
        { box: { x: 0, y: 0, w: 1, h: 0.3 } })],
      OPTIONS,
    );

    // 框缩了字号却不缩的话，文字会照原大小画出去压住下一个块
    const text = shapes.find((shape) => shape.kind === 'text');
    const table = shapes.find((shape) => shape.kind === 'table');
    expect(text?.kind === 'text' && text.fontScale).toBeLessThan(1);
    expect(table?.kind === 'table' && table.fontScale).toBeLessThan(1);
  });

  it('leaves the font alone when the stack already fits', () => {
    const shapes = layoutRegions([region([{ kind: 'text', paragraphs: [para('短')] }])], OPTIONS);
    expect(shapes[0].kind === 'text' && shapes[0].fontScale).toBeUndefined();
  });

  it('gives long text more height than short text', () => {
    const short = layoutRegions([region([{ kind: 'text', paragraphs: [para('短')] }])], OPTIONS)[0];
    const long = layoutRegions(
      [region([{ kind: 'text', paragraphs: [para('很长的一段话'.repeat(40))] }])],
      OPTIONS,
    )[0];
    expect(long.box.h).toBeGreaterThan(short.box.h);
  });

  it('keeps a picture at its natural aspect ratio and centers it', () => {
    const shapes = layoutRegions(
      [region([{ kind: 'image', src: 'a.png', alt: '', width: null, height: null }])],
      { ...OPTIONS, imageSize: () => ({ width: 800, height: 400 }) },
    );

    const shape = shapes[0];
    expect(shape.box.w / shape.box.h).toBeCloseTo(2, 5);
    expect(shape.box.x + shape.box.w / 2).toBeCloseTo(960, 0);
  });

  it('honours an explicit width from the markdown and derives the height', () => {
    const shapes = layoutRegions(
      [region([{ kind: 'image', src: 'a.png', alt: '', width: 600, height: null }])],
      { ...OPTIONS, imageSize: () => ({ width: 1200, height: 600 }) },
    );
    expect(shapes[0].box.w).toBeCloseTo(600, 5);
    expect(shapes[0].box.h).toBeCloseTo(300, 5);
  });

  it('shrinks an oversized picture to fit the region', () => {
    const shapes = layoutRegions(
      [region([{ kind: 'image', src: 'a.png', alt: '', width: 4000, height: null }],
        { box: { x: 0, y: 0, w: 0.5, h: 1 } })],
      { ...OPTIONS, imageSize: () => ({ width: 4000, height: 2000 }) },
    );
    expect(shapes[0].box.w).toBeLessThanOrEqual(960);
  });

  it('emits a background shape first so region fills sit behind the text', () => {
    const shapes = layoutRegions(
      [region([{ kind: 'text', paragraphs: [para('前景') ] }], { fill: 'EEEEEE', geometry: 'ellipse' })],
      OPTIONS,
    );
    expect(shapes[0].kind).toBe('shape');
    if (shapes[0].kind === 'shape') {
      expect(shapes[0].fill).toBe('EEEEEE');
      expect(shapes[0].geometry).toBe('ellipse');
    }
    expect(shapes[1].kind).toBe('text');
  });

  it('renders an unexportable block as a small centered note', () => {
    const shapes = layoutRegions([region([{ kind: 'note', label: 'Mermaid 图' }])], OPTIONS);
    expect(shapes[0].kind).toBe('text');
    if (shapes[0].kind !== 'text') return;
    expect(shapes[0].paragraphs[0].runs[0].text).toBe('Mermaid 图');
    expect(shapes[0].paragraphs[0].align).toBe('ctr');
  });
});
