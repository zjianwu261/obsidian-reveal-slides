import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installTapNavigation } from '../../src/engine/tapNavigation';

const VIEWPORT = 1000;

/** jsdom 没有 PointerEvent，用 MouseEvent 补上 pointerType 即可 */
function pointer(type: string, x: number, pointerType = 'touch'): Event {
  const event = new MouseEvent(type, { clientX: x, clientY: 100, bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}

describe('installTapNavigation', () => {
  let deck: { next: ReturnType<typeof vi.fn>; prev: ReturnType<typeof vi.fn> };
  let clock: number;
  let uninstall: () => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    deck = { next: vi.fn(), prev: vi.fn() };
    clock = 0;
    uninstall = installTapNavigation(document, deck, () => VIEWPORT, () => clock);
  });

  /** 在 from 上按下抬起（事件冒泡到 document，target 即 from） */
  const tap = (x: number, from: EventTarget = document): void => {
    from.dispatchEvent(pointer('pointerdown', x));
    from.dispatchEvent(pointer('pointerup', x));
  };

  it('taps on the right go forward', () => {
    tap(800);
    expect(deck.next).toHaveBeenCalledOnce();
    expect(deck.prev).not.toHaveBeenCalled();
  });

  it('taps on the left edge go back', () => {
    tap(100);
    expect(deck.prev).toHaveBeenCalledOnce();
  });

  /* 滑动是 reveal 自己的手势，别抢 */
  it('ignores a swipe', () => {
    document.dispatchEvent(pointer('pointerdown', 800));
    document.dispatchEvent(pointer('pointerup', 600));
    expect(deck.next).not.toHaveBeenCalled();
  });

  it('ignores a long press', () => {
    document.dispatchEvent(pointer('pointerdown', 800));
    clock = 900;
    document.dispatchEvent(pointer('pointerup', 800));
    expect(deck.next).not.toHaveBeenCalled();
  });

  /* 桌面端点一下是要选字、点链接的 */
  it('ignores mouse clicks', () => {
    document.dispatchEvent(pointer('pointerdown', 800, 'mouse'));
    document.dispatchEvent(pointer('pointerup', 800, 'mouse'));
    expect(deck.next).not.toHaveBeenCalled();
  });

  it('leaves a link to itself', () => {
    const link = document.createElement('a');
    link.href = 'https://example.com';
    document.body.appendChild(link);

    tap(800, link);
    expect(deck.next).not.toHaveBeenCalled();
  });

  it("leaves reveal's own controls alone", () => {
    const controls = document.createElement('div');
    controls.className = 'controls';
    const arrow = document.createElement('button');
    controls.appendChild(arrow);
    document.body.appendChild(controls);

    tap(800, arrow);
    expect(deck.next).not.toHaveBeenCalled();
  });

  it('stops listening once uninstalled', () => {
    uninstall();
    tap(800);
    expect(deck.next).not.toHaveBeenCalled();
  });
});
