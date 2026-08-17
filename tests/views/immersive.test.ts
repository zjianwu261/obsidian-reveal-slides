import { describe, it, expect, vi } from 'vitest';
import {
  IMMERSIVE_CLASS,
  LANDSCAPE_CLASS,
  ScreenWakeLock,
  applyImmersiveGeometry,
  immersiveStyle,
  isImmersive,
  isPortrait,
  setImmersive,
  syncLandscape,
  toggleImmersive,
  tryLockLandscape,
  unlockOrientation,
} from '../../src/views/immersive';

const body = () => document.createElement('body');

describe('immersive class', () => {
  it('starts off', () => {
    expect(isImmersive(body())).toBe(false);
  });

  it('sets and clears without touching anything else', () => {
    const el = body();
    el.classList.add('theme-dark');

    setImmersive(el, true);
    expect(el.classList.contains(IMMERSIVE_CLASS)).toBe(true);

    setImmersive(el, false);
    expect(el.classList.contains(IMMERSIVE_CLASS)).toBe(false);
    expect(el.classList.contains('theme-dark')).toBe(true);
  });

  it('toggles and reports the new state', () => {
    const el = body();
    expect(toggleImmersive(el)).toBe(true);
    expect(toggleImmersive(el)).toBe(false);
  });

  it('is idempotent', () => {
    const el = body();
    setImmersive(el, true);
    setImmersive(el, true);
    expect(el.className.match(new RegExp(IMMERSIVE_CLASS, 'g'))).toHaveLength(1);
  });
});

describe('landscape', () => {
  it('reads the viewport, not the device', () => {
    expect(isPortrait({ innerWidth: 390, innerHeight: 844 })).toBe(true);
    expect(isPortrait({ innerWidth: 844, innerHeight: 390 })).toBe(false);
  });

  /* 视口已经是横的时候再转 90°，等于把画面拧回竖的 */
  it('only rotates a portrait viewport', () => {
    const el = body();
    expect(syncLandscape(el, true, true)).toBe(true);
    expect(el.classList.contains(LANDSCAPE_CLASS)).toBe(true);

    expect(syncLandscape(el, true, false)).toBe(false);
    expect(el.classList.contains(LANDSCAPE_CLASS)).toBe(false);
  });

  it('drops the rotation when immersive ends', () => {
    const el = body();
    syncLandscape(el, true, true);
    expect(syncLandscape(el, false, true)).toBe(false);
    expect(el.classList.contains(LANDSCAPE_CLASS)).toBe(false);
  });

  it('takes a real orientation lock when the platform has one', async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    expect(await tryLockLandscape({ lock })).toBe(true);
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  /* iOS 没有这个 API，安卓要求先进全屏 —— 转不动是常态，交给 CSS 兜底 */
  it('reports failure instead of throwing', async () => {
    expect(await tryLockLandscape(undefined)).toBe(false);
    expect(await tryLockLandscape({})).toBe(false);
    expect(await tryLockLandscape({ lock: () => Promise.reject(new Error('NotSupported')) })).toBe(
      false,
    );
  });

  it('unlocking is safe on platforms without the API', () => {
    expect(() => unlockOrientation(undefined)).not.toThrow();
    expect(() => unlockOrientation({ unlock: () => { throw new Error('nope'); } })).not.toThrow();
  });
});

describe('immersive geometry', () => {
  const viewport = { width: 390, height: 844 };

  it('fills the viewport when nothing pushed the container around', () => {
    expect(immersiveStyle({ left: 0, top: 0 }, viewport, false)).toEqual({
      left: '0px',
      top: '0px',
      width: '390px',
      height: '844px',
      transform: '',
    });
  });

  /*
   * 回归：Obsidian 移动端的抽屉容器带 transform，transform 祖先会把 position: fixed
   * 变成相对该祖先定位 —— 容器落在标题栏之下，inset: 0 铺不满屏。画面于是偏下、不居中，
   * 底部被推出屏幕，reveal 放在右下角的页码第一个看不见。用负偏移把它顶回屏幕原点。
   */
  it('cancels the offset an ancestor imposed', () => {
    expect(immersiveStyle({ left: 0, top: 48 }, viewport, false)).toMatchObject({
      top: '-48px',
      height: '844px',
    });
  });

  it('swaps width and height when rotated', () => {
    expect(immersiveStyle({ left: 0, top: 48 }, viewport, true)).toEqual({
      left: '0px',
      top: '-48px',
      width: '844px',
      height: '390px',
      transform: 'rotate(90deg) translateY(-100%)',
    });
  });

  it('measures first, then applies - and clears everything on the way out', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: 0, top: 48 }) as DOMRect;

    applyImmersiveGeometry(el, viewport, { rotate: true });
    expect(el.style.top).toBe('-48px');
    expect(el.style.width).toBe('844px');
    expect(el.style.transform).toContain('rotate(90deg)');

    applyImmersiveGeometry(el, viewport, null);
    expect(el.style.top).toBe('');
    expect(el.style.width).toBe('');
    expect(el.style.transform).toBe('');
  });
});

describe('ScreenWakeLock', () => {
  it('holds a sentinel and releases it', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const lock = new ScreenWakeLock();

    expect(await lock.acquire({ wakeLock: { request: async () => ({ release }) } })).toBe(true);
    expect(lock.held).toBe(true);

    await lock.release();
    expect(release).toHaveBeenCalledOnce();
    expect(lock.held).toBe(false);
  });

  it('does not ask twice while it already holds one', async () => {
    const request = vi.fn().mockResolvedValue({ release: async () => undefined });
    const lock = new ScreenWakeLock();

    await lock.acquire({ wakeLock: { request } });
    await lock.acquire({ wakeLock: { request } });
    expect(request).toHaveBeenCalledOnce();
  });

  /* 拿不到锁顶多是屏幕会暗，不该把预览也带崩 */
  it('swallows a platform that has no wake lock, or refuses one', async () => {
    expect(await new ScreenWakeLock().acquire({})).toBe(false);

    const refusing = new ScreenWakeLock();
    const denied = { wakeLock: { request: () => Promise.reject(new Error('NotAllowedError')) } };
    expect(await refusing.acquire(denied)).toBe(false);
    expect(refusing.held).toBe(false);
  });

  it('releasing without a lock is harmless', async () => {
    await expect(new ScreenWakeLock().release()).resolves.toBeUndefined();
  });
});
