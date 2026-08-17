/**
 * 轻点翻页（运行在预览 iframe 内，纯 DOM 操作，不依赖 obsidian）。
 *
 * reveal 自带的触摸手势只有滑动。手拿着手机讲课时，拇指点一下比划一下顺手得多，
 * 而且滑动在幻灯片里还要跟链接、Mermaid 图的拖动抢事件。
 *
 * 只认「触摸的轻点」：
 *   - pointerType 必须是 touch —— 桌面端用鼠标点是要选中文字、点链接的，不能翻页；
 *   - 位移超过阈值或按住太久都不算轻点，留给 reveal 的滑动手势和长按菜单；
 *   - 落在链接、按钮、输入框、reveal 控件上的点击照旧交给它们本人。
 * 屏幕左侧一条窄边回上一页，其余向下一页 —— 与绝大多数阅读器一致。
 */

/** 位移超过这么多像素就当成滑动，不再算轻点 */
const MOVE_TOLERANCE = 10;
/** 按住超过这么久就当成长按 */
const HOLD_LIMIT_MS = 500;
/** 左侧多宽的一条算「上一页」 */
const BACK_ZONE = 0.25;

/** 只用到 next/prev，方便测试注入 */
export interface TapDeck {
  next(): void;
  prev(): void;
}

const INTERACTIVE = 'a, button, input, select, textarea, video, audio, [contenteditable]';
/** reveal 自己的控件：翻页箭头、进度条、演讲者备注按钮…… */
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

/**
 * 装上轻点翻页。返回卸载函数（重渲染不重建页面，这里其实只装一次）。
 * width 取自 root 所在窗口的可视宽度，旋转由浏览器映射，无需另行换算。
 */
export function installTapNavigation(
  root: Document,
  deck: TapDeck,
  viewportWidth: () => number,
  now: () => number = () => Date.now(),
): () => void {
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

    if (event.clientX < viewportWidth() * BACK_ZONE) deck.prev();
    else deck.next();
  };

  root.addEventListener('pointerdown', onDown as EventListener);
  root.addEventListener('pointerup', onUp as EventListener);

  return () => {
    root.removeEventListener('pointerdown', onDown as EventListener);
    root.removeEventListener('pointerup', onUp as EventListener);
  };
}
