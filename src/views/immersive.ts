/**
 * 沉浸式预览。
 *
 * 手机上光是 Obsidian 自己的界面就吃掉大半屏：顶上的标题栏、底部的悬浮工具条、
 * 状态栏，再加上 16:9 画布在竖屏里的上下黑边，真正留给幻灯片的只剩中间窄窄一条
 * （见 issue 里那张截图）。沉浸式把预览面板钉成整屏、藏掉这些外壳，
 * 幻灯片能拿到的宽度立刻翻倍。
 *
 * 状态只是 <body> 上的一个 class，样式全在 main.scss 里 —— 进出沉浸式不动 DOM 结构，
 * 也就不会打断 iframe（重建 iframe 等于重载整个 deck，几 MB 的 bundle 要重跑一遍）。
 */

export const IMMERSIVE_CLASS = 'rfo-immersive';

export function isImmersive(body: HTMLElement): boolean {
  return body.classList.contains(IMMERSIVE_CLASS);
}

/** 设为指定状态，返回设置后的状态（便于调用方同步按钮） */
export function setImmersive(body: HTMLElement, on: boolean): boolean {
  body.classList.toggle(IMMERSIVE_CLASS, on);
  return on;
}

/** 取反，返回切换后的状态 */
export function toggleImmersive(body: HTMLElement): boolean {
  return setImmersive(body, !isImmersive(body));
}

/** navigator.wakeLock 的最小接口（避免依赖 lib.dom 的具体版本） */
interface WakeLockLike {
  request(type: 'screen'): Promise<{ release(): Promise<void> }>;
}
interface NavigatorLike {
  wakeLock?: WakeLockLike;
}

/**
 * 讲课时别让屏幕自己睡过去。
 * Wake Lock 在部分平台/版本上不存在或被拒（页面不可见、省电模式），
 * 失败一律咽掉：拿不到锁顶多是屏幕会暗，不该因此打断预览。
 */
export class ScreenWakeLock {
  private sentinel: { release(): Promise<void> } | null = null;

  async acquire(nav: NavigatorLike): Promise<boolean> {
    if (this.sentinel || !nav.wakeLock) return false;
    try {
      this.sentinel = await nav.wakeLock.request('screen');
      return true;
    } catch {
      this.sentinel = null;
      return false;
    }
  }

  async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;
    try {
      await sentinel?.release();
    } catch {
      // 已经被系统收走了，无事可做
    }
  }

  get held(): boolean {
    return this.sentinel !== null;
  }
}
