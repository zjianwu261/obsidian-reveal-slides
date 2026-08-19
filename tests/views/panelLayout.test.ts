import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RATIO,
  MIN_INPUT_HEIGHT,
  chatKeyAction,
  clampPanelRatio,
  heightToRemember,
  inputHeight,
  ratioFromHeight,
} from '../../src/views/panelLayout';
import type { ChatKeyAction, ChatKeyEvent } from '../../src/views/panelLayout';

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

  /* 斜杠菜单开着的时候，这几个键归菜单 */
  describe('with the slash menu open', () => {
    const menu = (over: Partial<ChatKeyEvent> = {}): ChatKeyAction =>
      chatKeyAction(press(over), true);

    it('walks the list with the arrow keys', () => {
      expect(menu({ key: 'ArrowDown' })).toBe('menu-next');
      expect(menu({ key: 'ArrowUp' })).toBe('menu-prev');
    });

    it('picks the highlighted command with Enter or Tab', () => {
      expect(menu({ key: 'Enter' })).toBe('menu-accept');
      expect(menu({ key: 'Tab' })).toBe('menu-accept');
    });

    /* Shift + Tab 是往回跳焦点：抢了就跳不出输入框 */
    it('leaves Shift + Tab to the browser', () => {
      expect(menu({ key: 'Tab', shiftKey: true })).toBe('pass');
    });

    it('closes on Escape', () => {
      expect(menu({ key: 'Escape' })).toBe('menu-close');
    });

    /* 写内容和挑命令是两回事：Alt/Shift + Enter 仍然换行 */
    it('still breaks the line on Alt or Shift + Enter', () => {
      expect(menu({ altKey: true })).toBe('newline');
      expect(menu({ shiftKey: true })).toBe('newline');
    });

    /* 输入法的候选词也用上下键翻 —— 拼字时一个都不能抢 */
    it('yields every key to the IME while composing', () => {
      expect(menu({ key: 'ArrowDown', isComposing: true })).toBe('pass');
      expect(menu({ key: 'Enter', isComposing: true })).toBe('pass');
    });

    it('leaves the arrow keys alone when the menu is closed', () => {
      expect(chatKeyAction(press({ key: 'ArrowDown' }))).toBe('pass');
    });
  });
});

describe('inputHeight', () => {
  /* 一句话的时候就该是两行高，别一上来占半屏 */
  it('never goes below two rows', () => {
    expect(inputHeight(10, 400)).toBe(MIN_INPUT_HEIGHT);
  });

  it('follows the content in between', () => {
    expect(inputHeight(120, 600)).toBe(120);
  });

  /* 长文一贴就把对话记录顶没了的话，看不见上一轮回复在说什么 */
  it('stops at four tenths of the panel', () => {
    expect(inputHeight(500, 600)).toBe(240);
  });

  /* 面板本身被拖得很矮时，下限说了算 —— 输入框不能比两行还矮 */
  it('keeps two rows even in a tiny panel', () => {
    expect(inputHeight(500, 60)).toBe(MIN_INPUT_HEIGHT);
  });
});

describe('heightToRemember', () => {
  it('remembers what you dragged out', () => {
    expect(heightToRemember(180)).toBe(180);
  });

  /* 拖回最矮＝要自动挡回来，手动挡挂上摘不掉的话没地方复位 */
  it('reads a drag back to the bottom as going automatic', () => {
    expect(heightToRemember(MIN_INPUT_HEIGHT)).toBe(0);
    expect(heightToRemember(MIN_INPUT_HEIGHT + 3)).toBe(0);
  });
});
