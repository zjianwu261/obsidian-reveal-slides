import { describe, it, expect } from 'vitest';
import { SLIDE_LAYOUTS, composeRequest } from '../../src/views/slideLayouts';

describe('SLIDE_LAYOUTS', () => {
  it('gives every layout a unique id', () => {
    const ids = SLIDE_LAYOUTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /* 缩略图就是分布图：格子不能画到画布外面去 */
  it('keeps every box inside the canvas', () => {
    for (const layout of SLIDE_LAYOUTS) {
      for (const box of layout.boxes) {
        expect(box.x + box.w, `${layout.id} ${box.kind} 出界`).toBeLessThanOrEqual(100);
        expect(box.y + box.h, `${layout.id} ${box.kind} 出界`).toBeLessThanOrEqual(100);
      }
    }
  });

  /* 界面上画的百分比，就是发给模型的那几个数字 —— 对不上就等于骗人 */
  it('sends the same numbers it draws', () => {
    for (const layout of SLIDE_LAYOUTS) {
      for (const box of layout.boxes) {
        if (box.kind === 'bar' || box.kind === 'foot') continue;
        expect(layout.instruction).toContain(`dim="${box.w} ${box.h}"`);
        expect(layout.instruction).toContain(`pos="${box.x} ${box.y}"`);
      }
    }
  });

  /* 并排时图会被压窄，不放大字就比正文小一圈 */
  it('asks for textScale whenever the figure sits beside the text', () => {
    for (const layout of SLIDE_LAYOUTS) {
      const fig = layout.boxes.find((b) => b.kind === 'fig');
      if (fig && fig.w < 88) expect(layout.instruction, layout.id).toContain('textScale');
    }
  });
});

describe('composeRequest', () => {
  const layout = SLIDE_LAYOUTS[0];

  it('sends what you typed when no layout is picked', () => {
    expect(composeRequest('  精简正文  ', null)).toBe('精简正文');
  });

  /* 先听人说要改什么，再补一句排到哪儿 */
  it('appends the layout after the request', () => {
    const composed = composeRequest('精简正文', layout);
    expect(composed.startsWith('精简正文')).toBe(true);
    expect(composed).toContain(layout.instruction);
  });

  /* 点一下版式就直接发，是最常见的用法 */
  it('sends the layout alone when nothing was typed', () => {
    expect(composeRequest('   ', layout)).toBe(layout.instruction);
  });

  it('stays empty when there is nothing to send', () => {
    expect(composeRequest('   ', null)).toBe('');
  });
});
