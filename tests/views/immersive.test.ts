import { describe, it, expect, vi } from 'vitest';
import {
  IMMERSIVE_CLASS,
  ScreenWakeLock,
  isImmersive,
  setImmersive,
  toggleImmersive,
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
