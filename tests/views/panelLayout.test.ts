import { describe, it, expect } from 'vitest';
import { chatKeyAction, clampPanelHeight, defaultPanelHeight } from '../../src/views/panelLayout';
import type { ChatKeyEvent } from '../../src/views/panelLayout';

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

/*
 * 输入区的按键：Enter 发送、Alt/Shift + Enter 换行。
 * 中文输入法选词时的 Enter 必须放过 —— 那是上屏，不是发送。
 */
describe('chatKeyAction', () => {
  const press = (over: Partial<ChatKeyEvent> = {}): ChatKeyEvent => ({
    key: 'Enter',
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    isComposing: false,
    ...over,
  });

  it('sends on a bare Enter', () => {
    expect(chatKeyAction(press())).toBe('send');
  });

  it('breaks the line on Alt or Shift', () => {
    expect(chatKeyAction(press({ altKey: true }))).toBe('newline');
    expect(chatKeyAction(press({ shiftKey: true }))).toBe('newline');
  });

  it('keeps the old muscle memory working', () => {
    expect(chatKeyAction(press({ metaKey: true }))).toBe('send');
    expect(chatKeyAction(press({ ctrlKey: true }))).toBe('send');
  });

  it('never fires while the IME is composing', () => {
    expect(chatKeyAction(press({ isComposing: true }))).toBe('pass');
    expect(chatKeyAction(press({ isComposing: true, altKey: true }))).toBe('pass');
  });

  it('ignores every other key', () => {
    expect(chatKeyAction(press({ key: 'a' }))).toBe('pass');
    expect(chatKeyAction(press({ key: 'Escape' }))).toBe('pass');
  });
});

/* 初次打开的高度：按面板比例算，写死像素在不同尺寸下都不对 */
describe('defaultPanelHeight', () => {
  it('takes about three tenths of the pane', () => {
    expect(defaultPanelHeight(800)).toBe(224);
  });

  it('does not shrink below a usable box in a short pane', () => {
    expect(defaultPanelHeight(300)).toBe(150);
  });

  it('does not run away in a tall pane', () => {
    expect(defaultPanelHeight(2000)).toBe(300);
  });
});
