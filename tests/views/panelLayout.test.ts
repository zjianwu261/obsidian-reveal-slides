import { describe, it, expect } from 'vitest';
import { clampPanelHeight } from '../../src/views/panelLayout';

/*
 * 拖分割线时高度要落在合理区间：太矮看不到回复，太高幻灯片就没地方了。
 */
describe('clampPanelHeight', () => {
  it('keeps a sensible drag as it is', () => {
    expect(clampPanelHeight(300, 900)).toBe(300);
  });

  it('never goes below the floor', () => {
    expect(clampPanelHeight(10, 900)).toBe(90);
    expect(clampPanelHeight(-50, 900)).toBe(90);
  });

  it('leaves at least 30% of the pane to the slide', () => {
    expect(clampPanelHeight(880, 900)).toBe(630);
  });

  /* 面板本身很矮时，下限优先——否则对话框会被压成一条缝 */
  it('honours the floor even in a tiny pane', () => {
    expect(clampPanelHeight(500, 100)).toBe(90);
  });

  it('rounds to whole pixels', () => {
    expect(clampPanelHeight(220.6, 900)).toBe(221);
  });
});
