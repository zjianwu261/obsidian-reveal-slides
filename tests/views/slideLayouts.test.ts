import { describe, it, expect } from 'vitest';
import {
  SLIDE_LAYOUTS,
  blockInstruction,
  composeRequest,
  findBox,
  layoutInstruction,
  requestedBlock,
} from '../../src/views/slideLayouts';

const layoutById = (id: string) => SLIDE_LAYOUTS.find((l) => l.id === id)!;

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
});

describe('layoutInstruction', () => {
  /* 界面上画的百分比，就是发给模型的那几个数字 */
  it('sends the same numbers it draws', () => {
    for (const layout of SLIDE_LAYOUTS) {
      const text = layoutInstruction(layout);
      for (const box of layout.boxes) {
        if (box.kind === 'bar' || box.kind === 'foot') continue;
        expect(text).toContain(`dim="${box.w} ${box.h}"`);
        expect(text).toContain(`pos="${box.x} ${box.y}"`);
      }
    }
  });

  /* 并排时图被压窄，不放大字就比正文小一圈 */
  it('asks for textScale whenever the figure sits beside the text', () => {
    expect(layoutInstruction(layoutById('fig-left'))).toContain('textScale');
    expect(layoutInstruction(layoutById('fig-top'))).not.toContain('textScale');
  });
});

describe('blockInstruction', () => {
  /* 同一条 /fig，宽度跟着版式走 */
  it('takes the width from the chosen layout', () => {
    expect(blockInstruction(layoutById('fig-top'), 'fig')).toContain('dim="92 34"');
    expect(blockInstruction(layoutById('fig-left'), 'fig')).toContain('dim="58 66"');
    expect(blockInstruction(layoutById('fig-right'), 'fig')).toContain('dim="58 66"');
  });

  it('scopes the abstract the same way', () => {
    expect(blockInstruction(layoutById('fig-top'), 'abstract')).toContain('dim="92 26"');
    expect(blockInstruction(layoutById('fig-left'), 'abstract')).toContain('dim="36 66"');
  });

  /* 只改一块时，别顺手把别的块也动了 */
  it('leaves the rest of the page alone', () => {
    const text = blockInstruction(layoutById('fig-top'), 'fig')!;
    expect(text).not.toContain('class="abstract"');
    expect(text).toContain('其余的块保持原样');
  });

  it('only asks for textScale when the figure is narrow', () => {
    expect(blockInstruction(layoutById('fig-left'), 'fig')).toContain('textScale');
    expect(blockInstruction(layoutById('fig-top'), 'fig')).not.toContain('textScale');
  });

  /* 拿「通栏正文」配图：这个版式压根没有图的位置 */
  it('comes back empty when the layout has no such block', () => {
    expect(blockInstruction(layoutById('text-only'), 'fig')).toBeNull();
    expect(findBox(layoutById('text-only'), 'fig')).toBeNull();
  });
});

describe('requestedBlock', () => {
  it('reads the block off the class the request names', () => {
    expect(requestedBlock('配一张图，放进 class="fig" 的 grid')).toBe('fig');
    expect(requestedBlock('总结成 class="abstract" 的大纲')).toBe('abstract');
  });

  /* 两块都提到（或都没提）就是整页重排，不该缩到一块上 */
  it('stays out of it when the request is about the whole page', () => {
    expect(requestedBlock('把这页重排一下')).toBeNull();
    expect(requestedBlock('class="fig" 和 class="abstract" 都调一下')).toBeNull();
  });
});

describe('composeRequest', () => {
  const layout = layoutById('fig-left');

  it('sends what you typed when no layout is picked', () => {
    expect(composeRequest('  精简正文  ', null)).toBe('精简正文');
  });

  /* 先听人说要改什么，再补一句排到哪儿 */
  it('appends the whole-page layout after a general request', () => {
    const composed = composeRequest('重排这一页', layout);
    expect(composed.startsWith('重排这一页')).toBe(true);
    expect(composed).toContain(layoutInstruction(layout));
  });

  /* /fig 只拿图那一格的宽高，不该连正文一起被摆布 */
  it('narrows to one block when the request names one', () => {
    const composed = composeRequest('配一张图，放进 class="fig" 的 grid', layout);
    expect(composed).toContain('dim="58 66"');
    expect(composed).not.toContain('dim="36 66"');
  });

  /* 点一下版式就直接发，是最常见的用法 */
  it('sends the layout alone when nothing was typed', () => {
    expect(composeRequest('   ', layout)).toBe(layoutInstruction(layout));
  });

  /* 版式里没有这一块时，宁可不附版式，也不能瞎给一个宽度 */
  it('drops the layout when it has no room for the block asked about', () => {
    const request = '配一张图，放进 class="fig" 的 grid';
    expect(composeRequest(request, layoutById('text-only'))).toBe(request);
  });

  it('stays empty when there is nothing to send', () => {
    expect(composeRequest('   ', null)).toBe('');
  });
});
