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
export const LANDSCAPE_CLASS = 'rfo-landscape';

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

/**
 * 沉浸式下横过来放。
 *
 * 16:9 的画布在竖屏里只能用掉屏幕宽度那一条，横过来几乎能铺满 —— 同一部手机，
 * 幻灯片能大出两倍不止。
 *
 * 优先让系统真的转（screen.orientation.lock），但这条路在 iOS 上根本不存在，
 * 安卓也要求先进全屏，所以转不动是常态。转不动就退而求其次：把预览容器整体旋转 90°，
 * 用户把手机**向左转**（顶部朝左）就是正的。旋转是元素级的，浏览器会把触摸坐标一并
 * 映射过去，所以滑动翻页、轻点翻页在用户眼里方向都还是对的。
 *
 * 只在视口确实是竖着时才转：系统没锁方向的话，用户一转手机，Obsidian 自己就横过来了，
 * 这时再转 90° 反而把画面拧回竖的。
 */
export function isPortrait(win: { innerWidth: number; innerHeight: number }): boolean {
  return win.innerHeight > win.innerWidth;
}

/** 返回是否真的转了（视口本来就是横的就不转） */
export function syncLandscape(body: HTMLElement, wanted: boolean, portrait: boolean): boolean {
  const rotate = wanted && portrait;
  body.classList.toggle(LANDSCAPE_CLASS, rotate);
  return rotate;
}

/** screen.orientation 的最小接口 */
interface OrientationLike {
  lock?(orientation: 'landscape'): Promise<void>;
  unlock?(): void;
}

/** 让系统转屏。不支持（iOS）或被拒（未进全屏）都返回 false，交给 CSS 旋转兜底 */
export async function tryLockLandscape(orientation: OrientationLike | undefined): Promise<boolean> {
  if (!orientation?.lock) return false;
  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

export function unlockOrientation(orientation: OrientationLike | undefined): void {
  try {
    orientation?.unlock?.();
  } catch {
    // 没锁上过，也就无所谓解锁
  }
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
