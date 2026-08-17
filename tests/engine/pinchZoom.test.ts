import { describe, it, expect, vi } from 'vitest';
import {
  IDENTITY,
  PinchZoom,
  clampPan,
  clampScale,
  isZoomed,
  toCss,
  zoomAt,
} from '../../src/engine/pinchZoom';

const viewport = { width: 1000, height: 600 };

describe('zoom math', () => {
  it('never shrinks below 1 or grows past 4', () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(9)).toBe(4);
    expect(clampScale(2.5)).toBe(2.5);
  });

  /* 锚点底下那块内容必须钉住，否则捏合时画面会往一边跑 */
  it('keeps the pinch anchor in place', () => {
    const anchor = { x: 400, y: 300 };
    const next = zoomAt(IDENTITY, anchor, 2);
    // 内容坐标 p = (anchor - x) / scale，缩放前后应指向同一个 p
    const before = (anchor.x - IDENTITY.x) / IDENTITY.scale;
    const after = (anchor.x - next.x) / next.scale;
    expect(after).toBeCloseTo(before);
    expect(next.scale).toBe(2);
  });

  it('does not let the zoomed content be dragged off screen', () => {
    const dragged = { scale: 2, x: 500, y: 400 };
    expect(clampPan(dragged, viewport)).toEqual({ scale: 2, x: 0, y: 0 });

    const far = { scale: 2, x: -5000, y: -5000 };
    expect(clampPan(far, viewport)).toEqual({ scale: 2, x: -1000, y: -600 });
  });

  it('emits no transform at all when not zoomed', () => {
    expect(toCss(IDENTITY)).toBe('');
    expect(isZoomed(IDENTITY)).toBe(false);
    expect(toCss({ scale: 2, x: -10, y: -20 })).toBe('translate(-10px, -20px) scale(2)');
  });
});

/** jsdom 没有 PointerEvent：MouseEvent 补上 pointerId / pointerType 即可 */
function pointer(type: string, id: number, x: number, y: number): Event {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: id });
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  return event;
}

describe('PinchZoom', () => {
  const setup = (): { el: HTMLElement; zoom: PinchZoom; navLock: ReturnType<typeof vi.fn> } => {
    document.body.innerHTML = '<div class="reveal"></div>';
    const el = document.querySelector('.reveal') as HTMLElement;
    const navLock = vi.fn();
    const zoom = new PinchZoom(el, () => viewport, navLock);
    zoom.install(document);
    return { el, zoom, navLock };
  };

  it('scales up as the fingers spread', () => {
    const { el, zoom } = setup();

    document.dispatchEvent(pointer('pointerdown', 1, 400, 300));
    document.dispatchEvent(pointer('pointerdown', 2, 600, 300));
    document.dispatchEvent(pointer('pointermove', 2, 800, 300)); // 间距 200 → 400

    expect(zoom.zoomed).toBe(true);
    expect(el.style.transform).toContain('scale(2)');
  });

  /* reveal 把双指当成「进总览」的手势，放大后的单指拖动又会被当成翻页滑动 */
  it("locks reveal's touch navigation during the gesture", () => {
    const { navLock } = setup();

    document.dispatchEvent(pointer('pointerdown', 1, 400, 300));
    expect(navLock).not.toHaveBeenCalled();

    document.dispatchEvent(pointer('pointerdown', 2, 600, 300));
    expect(navLock).toHaveBeenLastCalledWith(true);

    document.dispatchEvent(pointer('pointerup', 2, 600, 300));
    document.dispatchEvent(pointer('pointerup', 1, 400, 300));
    expect(navLock).toHaveBeenLastCalledWith(false);
  });

  it('pans with one finger once zoomed, and not before', () => {
    const { el, zoom } = setup();

    // 没放大时单指移动不该动画面（那是 reveal 的滑动翻页）
    document.dispatchEvent(pointer('pointerdown', 1, 400, 300));
    document.dispatchEvent(pointer('pointermove', 1, 200, 300));
    expect(el.style.transform).toBe('');
    document.dispatchEvent(pointer('pointerup', 1, 200, 300));

    document.dispatchEvent(pointer('pointerdown', 1, 400, 300));
    document.dispatchEvent(pointer('pointerdown', 2, 600, 300));
    document.dispatchEvent(pointer('pointermove', 2, 800, 300));
    document.dispatchEvent(pointer('pointerup', 2, 800, 300));
    expect(zoom.zoomed).toBe(true);

    const before = el.style.transform;
    document.dispatchEvent(pointer('pointermove', 1, 380, 300));
    expect(el.style.transform).not.toBe(before);
  });

  it('snaps back to identity when pinched shut', () => {
    const { el, zoom } = setup();

    document.dispatchEvent(pointer('pointerdown', 1, 400, 300));
    document.dispatchEvent(pointer('pointerdown', 2, 800, 300));
    document.dispatchEvent(pointer('pointermove', 2, 600, 300)); // 间距 400 → 200
    document.dispatchEvent(pointer('pointerup', 2, 600, 300));
    document.dispatchEvent(pointer('pointerup', 1, 400, 300));

    expect(zoom.zoomed).toBe(false);
    expect(el.style.transform).toBe('');
  });

  it('resets on demand (the menu bar button)', () => {
    const { el, zoom } = setup();

    document.dispatchEvent(pointer('pointerdown', 1, 400, 300));
    document.dispatchEvent(pointer('pointerdown', 2, 600, 300));
    document.dispatchEvent(pointer('pointermove', 2, 900, 300));
    expect(zoom.zoomed).toBe(true);

    zoom.reset();
    expect(zoom.zoomed).toBe(false);
    expect(el.style.transform).toBe('');
  });

  it('ignores the mouse', () => {
    const { el } = setup();
    const mouseDown = new MouseEvent('pointerdown', { clientX: 400, clientY: 300, bubbles: true });
    Object.defineProperty(mouseDown, 'pointerType', { value: 'mouse' });
    document.dispatchEvent(mouseDown);
    expect(el.style.transform).toBe('');
  });
});
