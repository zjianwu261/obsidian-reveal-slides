import { describe, it, expect } from 'vitest';
import type { RevealConfig } from 'reveal.js';
import { applyHistoryGuard, canWriteHistory } from '../../src/engine/historyGuard';

describe('canWriteHistory', () => {
  it('allows the preview server and exported files', () => {
    expect(canWriteHistory('http:')).toBe(true);
    expect(canWriteHistory('https:')).toBe(true);
    expect(canWriteHistory('file:')).toBe(true);
  });

  it('refuses opaque pages', () => {
    expect(canWriteHistory('blob:')).toBe(false);
    expect(canWriteHistory('data:')).toBe(false);
    expect(canWriteHistory('about:')).toBe(false);
  });
});

describe('applyHistoryGuard', () => {
  /*
   * 回归：移动端预览页是 blob: URL，reveal 写 hash 时会调
   * history.replaceState(null, null, location.pathname)，把会话 URL 从 blob: 改成
   * capacitor: —— 浏览器拦下并抛 SecurityError，错误浮层糊满整页。
   */
  it('turns hash off on a blob: page', () => {
    const config = { hash: true } as RevealConfig;
    applyHistoryGuard(config, 'blob:');
    expect(config.hash).toBe(false);
    expect(config.respondToHashChanges).toBe(false);
  });

  it('leaves hash alone where the URL is writable', () => {
    const config = { hash: true } as RevealConfig;
    applyHistoryGuard(config, 'http:');
    expect(config.hash).toBe(true);
    expect(config.respondToHashChanges).toBeUndefined();
  });
});
