/**
 * 轻点翻页 / 呼出菜单（运行在预览 iframe 内，纯 DOM 操作，不依赖 obsidian）。
 *
 * reveal 自带的触摸手势只有滑动。手拿着手机讲课时，拇指点一下比划一下顺手得多，
 * 而且滑动在幻灯片里还要跟链接、Mermaid 图的拖动抢事件。
 *
 * 屏幕横向三等分，与电子书阅读器的习惯一致：左翻回去、右翻过去、中间呼出菜单。
 * 菜单本身在宿主那边（辅助线、刷新这些都是插件的事），这里只负责报信。
 *
 * 只认「触摸的轻点」：
 *   - pointerType 必须是 touch —— 桌面端用鼠标点是要选中文字、点链接的，不能翻页；
 *   - 位移超过阈值或按住太久都不算轻点，留给 reveal 的滑动手势和长按菜单；
 *   - 落在链接、按钮、输入框、reveal 控件上的点击照旧交给它们本人。
 */

/** 位移超过这么多像素就当成滑动，不再算轻点 */
const MOVE_TOLERANCE = 10;
/** 按住超过这么久就当成长按 */
const HOLD_LIMIT_MS = 500;
/** 三等分的分界 */
const LEFT_EDGE = 1 / 3;
const RIGHT_EDGE = 2 / 3;

export interface TapActions {
  next(): void;
  prev(): void;
  /** 中间那一竖条：呼出/收起宿主的菜单栏 */
  menu(): void;
}

export interface TapOptions {
  viewportWidth(): number;
  now?(): number;
  /**
   * 放大状态下别翻页：正在看细节，误翻一页很烦。
   * 中间的菜单照常呼得出来 —— 「重置缩放」就在那儿。
   */
  navigationSuspended?(): boolean;
}

const INTERACTIVE = 'a, button, input, select, textarea, video, audio, [contenteditable]';
/** reveal 自己的控件：翻页箭头、进度条、页码…… */
const REVEAL_CHROME = '.controls, .progress, .slide-number, .speaker-notes';

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(`${INTERACTIVE}, ${REVEAL_CHROME}`) !== null;
}

interface TapStart {
  x: number;
  y: number;
  at: number;
}

/** 轻点落在哪一区（0~1 的横向比例） */
export function tapZone(ratio: number): 'prev' | 'menu' | 'next' {
  if (ratio < LEFT_EDGE) return 'prev';
  if (ratio < RIGHT_EDGE) return 'menu';
  return 'next';
}

/** 装上轻点处理，返回卸载函数 */
export function installTapNavigation(
  root: Document,
  actions: TapActions,
  options: TapOptions,
): () => void {
  const now = options.now ?? ((): number => Date.now());
  let start: TapStart | null = null;

  const onDown = (event: PointerEvent): void => {
    start = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY, at: now() } : null;
  };

  const onUp = (event: PointerEvent): void => {
    const began = start;
    start = null;
    if (!began || event.pointerType !== 'touch') return;

    const moved = Math.hypot(event.clientX - began.x, event.clientY - began.y);
    if (moved > MOVE_TOLERANCE || now() - began.at > HOLD_LIMIT_MS) return;
    if (isInteractive(event.target)) return;

    const zone = tapZone(event.clientX / (options.viewportWidth() || 1));
    if (zone === 'menu') {
      actions.menu();
      return;
    }
    if (options.navigationSuspended?.()) return;
    if (zone === 'prev') actions.prev();
    else actions.next();
  };

  root.addEventListener('pointerdown', onDown as EventListener);
  root.addEventListener('pointerup', onUp as EventListener);

  return () => {
    root.removeEventListener('pointerdown', onDown as EventListener);
    root.removeEventListener('pointerup', onUp as EventListener);
  };
}
