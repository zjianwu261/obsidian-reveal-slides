/**
 * 双指缩放 + 放大后单指拖动（运行在预览 iframe 内，纯 DOM 操作，不依赖 obsidian）。
 *
 * 投影时看不清的小字、原理图上的引脚编号，在手机上想凑近看只能靠放大。
 * 系统的页面缩放在这里指望不上：iframe 里是 reveal 的等比画布，浏览器缩放会把
 * 整页连同外壳一起放大，而且 touch-action 一关就彻底没了。
 *
 * 变换挂在 .reveal 外层，不碰 .reveal .slides —— 那个 transform 是 reveal 自己按
 * 窗口尺寸算的画布缩放，每次 layout() 都会重写，挤进去只会互相覆盖。
 *
 * 手势期间和放大状态下必须关掉 reveal 的 touch 导航：
 *   - 两指捏合会被 reveal 当成「进总览」的手势；
 *   - 放大后单指拖动要用来平移，不能被认成翻页滑动。
 */

/** 放大上限：再大就只剩马赛克了 */
const MAX_SCALE = 4;
const MIN_SCALE = 1;
/** 略大于 1 才算「放大了」，避免浮点误差把 1.0000001 当成放大 */
const ZOOMED_EPSILON = 0.01;

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * 以 anchor（屏幕坐标）为锚点缩放：锚点底下的那块内容保持不动。
 * 变换是 translate(x, y) scale(s)，transform-origin 固定在左上角，
 * 于是内容点 p 落在 x + s·p —— 要让锚点 a 不动，解出 x' = a - (a - x)·s'/s。
 */
export function zoomAt(state: ZoomState, anchor: { x: number; y: number }, next: number): ZoomState {
  const scale = clampScale(next);
  const ratio = scale / state.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - state.x) * ratio,
    y: anchor.y - (anchor.y - state.y) * ratio,
  };
}

/** 平移后把内容拉回来，别让放大的画面被拖到屏幕外只剩一角 */
export function clampPan(state: ZoomState, viewport: Size): ZoomState {
  const minX = viewport.width * (1 - state.scale);
  const minY = viewport.height * (1 - state.scale);
  return {
    scale: state.scale,
    x: Math.min(0, Math.max(minX, state.x)),
    y: Math.min(0, Math.max(minY, state.y)),
  };
}

export function isZoomed(state: ZoomState): boolean {
  return state.scale > MIN_SCALE + ZOOMED_EPSILON;
}

export function toCss(state: ZoomState): string {
  return isZoomed(state) ? `translate(${state.x}px, ${state.y}px) scale(${state.scale})` : '';
}

interface Point {
  x: number;
  y: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export class PinchZoom {
  private state: ZoomState = { ...IDENTITY };
  private pointers = new Map<number, Point>();
  /** 两指按下时的基准：那一刻的间距与缩放，以及中点（用来算平移） */
  private gesture: { distance: number; scale: number; center: Point } | null = null;
  private navOff = false;

  constructor(
    private el: HTMLElement,
    private viewport: () => Size,
    /** 手势中或放大状态下要关掉 reveal 的 touch 导航 */
    private onNavLock: (locked: boolean) => void = () => {},
  ) {}

  get zoomed(): boolean {
    return isZoomed(this.state);
  }

  install(root: Document): () => void {
    const down = (event: PointerEvent): void => this.onDown(event);
    const move = (event: PointerEvent): void => this.onMove(event);
    const up = (event: PointerEvent): void => this.onUp(event);

    root.addEventListener('pointerdown', down as EventListener);
    root.addEventListener('pointermove', move as EventListener);
    root.addEventListener('pointerup', up as EventListener);
    root.addEventListener('pointercancel', up as EventListener);

    return () => {
      root.removeEventListener('pointerdown', down as EventListener);
      root.removeEventListener('pointermove', move as EventListener);
      root.removeEventListener('pointerup', up as EventListener);
      root.removeEventListener('pointercancel', up as EventListener);
    };
  }

  reset(): void {
    this.state = { ...IDENTITY };
    this.gesture = null;
    this.apply();
  }

  private onDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.startGesture();
    this.syncNavLock();
  }

  private onMove(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || !this.pointers.has(event.pointerId)) return;

    const previous = this.pointers.get(event.pointerId) as Point;
    const current = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, current);

    const [a, b] = [...this.pointers.values()];
    if (this.gesture && b) {
      const next = this.gesture.scale * (distance(a, b) / (this.gesture.distance || 1));
      const center = midpoint(a, b);
      const zoomed = zoomAt(this.state, center, next);
      // 中点自己也会移动，顺带把画面跟着挪 —— 双指整体平移就是这么来的
      this.state = clampPan(
        {
          scale: zoomed.scale,
          x: zoomed.x + (center.x - this.gesture.center.x),
          y: zoomed.y + (center.y - this.gesture.center.y),
        },
        this.viewport(),
      );
      this.gesture.center = center;
      this.apply();
      return;
    }

    // 单指：只有放大了才当平移，否则留给 reveal 的滑动翻页
    if (this.pointers.size === 1 && this.zoomed) {
      this.state = clampPan(
        {
          scale: this.state.scale,
          x: this.state.x + (current.x - previous.x),
          y: this.state.y + (current.y - previous.y),
        },
        this.viewport(),
      );
      this.apply();
    }
  }

  private onUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.gesture = null;
    // 捏回原大小就彻底复位，免得留下零点几像素的偏移
    if (!this.zoomed) this.state = { ...IDENTITY };
    this.apply();
    this.syncNavLock();
  }

  private startGesture(): void {
    const [a, b] = [...this.pointers.values()];
    if (!b) return;
    this.gesture = { distance: distance(a, b), scale: this.state.scale, center: midpoint(a, b) };
  }

  private syncNavLock(): void {
    const locked = this.pointers.size > 1 || this.zoomed;
    if (locked === this.navOff) return;
    this.navOff = locked;
    this.onNavLock(locked);
  }

  private apply(): void {
    this.el.style.transformOrigin = '0 0';
    this.el.style.transform = toCss(this.state);
  }
}
