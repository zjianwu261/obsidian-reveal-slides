import { describe, it, expect, vi } from 'vitest';
import {
  IMMERSIVE_CLASS,
  LANDSCAPE_CLASS,
  ScreenWakeLock,
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
