import { describe, it, expect } from 'vitest';
import { DEFAULT_RATIO, clampPanelRatio, ratioFromHeight } from '../../src/views/panelLayout';

/*
 * 拖分割线时高度要落在合理区间：太矮看不到回复，太高幻灯片就没地方了。
 */
describe('clampPanelRatio', () => {
  it('keeps a sensible ratio as it is', () => {
    expect(clampPanelRatio(0.4)).toBe(0.4);
  });

  it('leaves the slide at least three tenths of the pane', () => {
    expect(clampPanelRatio(0.95)).toBe(0.7);
  });

  it('never squeezes the chat into a sliver', () => {
    expect(clampPanelRatio(0.02)).toBe(0.15);
  });

  /* 老配置里存的是像素（几百），坏配置可能是 0 或 NaN —— 都退回默认四六开 */
  it('falls back to the default for anything unusable', () => {
    expect(clampPanelRatio(0)).toBe(DEFAULT_RATIO);
    expect(clampPanelRatio(Number.NaN)).toBe(DEFAULT_RATIO);
    expect(clampPanelRatio(-1)).toBe(DEFAULT_RATIO);
    expect(clampPanelRatio(395)).toBe(0.7);   // 像素被当成比例时也不会撑破
  });
});

describe('ratioFromHeight', () => {
  it('turns a dragged height into a ratio', () => {
    expect(ratioFromHeight(300, 1000)).toBe(0.3);
  });

  it('clamps at both ends', () => {
    expect(ratioFromHeight(950, 1000)).toBe(0.7);
    expect(ratioFromHeight(10, 1000)).toBe(0.15);
  });

  /* 面板还没排版时 clientHeight 是 0 —— 别拿它当分母 */
  it('falls back when the pane has no height yet', () => {
    expect(ratioFromHeight(300, 0)).toBe(DEFAULT_RATIO);
  });
});
