import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installTapNavigation, tapZone } from '../../src/engine/tapNavigation';

const VIEWPORT = 900;

/** jsdom 没有 PointerEvent，用 MouseEvent 补上 pointerType 即可 */
function pointer(type: string, x: number, pointerType = 'touch'): Event {
  const event = new MouseEvent(type, { clientX: x, clientY: 100, bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}

describe('tapZone', () => {
  it('splits the width into thirds', () => {
    expect(tapZone(0.1)).toBe('prev');
    expect(tapZone(0.5)).toBe('menu');
    expect(tapZone(0.9)).toBe('next');
  });
});

describe('installTapNavigation', () => {
  let actions: {
    next: ReturnType<typeof vi.fn>;
    prev: ReturnType<typeof vi.fn>;
    menu: ReturnType<typeof vi.fn>;
  };
  let clock: number;
  let zoomed: boolean;
  let uninstall: () => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    actions = { next: vi.fn(), prev: vi.fn(), menu: vi.fn() };
    clock = 0;
    zoomed = false;
    uninstall = installTapNavigation(document, actions, {
      viewportWidth: () => VIEWPORT,
      now: () => clock,
      navigationSuspended: () => zoomed,
    });
  });

  /** 在 from 上按下抬起（事件冒泡到 document，target 即 from） */
  const tap = (x: number, from: EventTarget = document): void => {
    from.dispatchEvent(pointer('pointerdown', x));
    from.dispatchEvent(pointer('pointerup', x));
  };

  it('right third goes forward, left third goes back', () => {
    tap(800);
    expect(actions.next).toHaveBeenCalledOnce();

    tap(100);
    expect(actions.prev).toHaveBeenCalledOnce();
  });

  it('the middle calls up the menu instead of turning the page', () => {
    tap(450);
    expect(actions.menu).toHaveBeenCalledOnce();
    expect(actions.next).not.toHaveBeenCalled();
    expect(actions.prev).not.toHaveBeenCalled();
  });

  /*
   * 放大是为了看细节，这时候误翻一页很烦。菜单要照常呼得出来 ——
   * 「重置缩放」的按钮就在那上面。
   */
  it('holds the page still while zoomed, but still opens the menu', () => {
    zoomed = true;

    tap(800);
    tap(100);
    expect(actions.next).not.toHaveBeenCalled();
    expect(actions.prev).not.toHaveBeenCalled();

    tap(450);
    expect(actions.menu).toHaveBeenCalledOnce();
  });

  /* 滑动是 reveal 自己的手势，别抢 */
  it('ignores a swipe', () => {
    document.dispatchEvent(pointer('pointerdown', 800));
    document.dispatchEvent(pointer('pointerup', 600));
    expect(actions.next).not.toHaveBeenCalled();
  });

  it('ignores a long press', () => {
    document.dispatchEvent(pointer('pointerdown', 800));
    clock = 900;
    document.dispatchEvent(pointer('pointerup', 800));
    expect(actions.next).not.toHaveBeenCalled();
  });

  /* 桌面端点一下是要选字、点链接的 */
  it('ignores mouse clicks', () => {
    document.dispatchEvent(pointer('pointerdown', 800, 'mouse'));
    document.dispatchEvent(pointer('pointerup', 800, 'mouse'));
    expect(actions.next).not.toHaveBeenCalled();
  });

  it('leaves a link to itself', () => {
    const link = document.createElement('a');
    link.href = 'https://example.com';
    document.body.appendChild(link);

    tap(800, link);
    expect(actions.next).not.toHaveBeenCalled();
  });

  it("leaves reveal's own controls alone", () => {
    const controls = document.createElement('div');
    controls.className = 'controls';
    const arrow = document.createElement('button');
    controls.appendChild(arrow);
    document.body.appendChild(controls);

    tap(800, arrow);
    expect(actions.next).not.toHaveBeenCalled();
  });

  it('stops listening once uninstalled', () => {
    uninstall();
    tap(800);
    expect(actions.next).not.toHaveBeenCalled();
  });
});
