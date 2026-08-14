import { describe, it, expect } from 'vitest';
import { computeCanvasSize, computeRootFontSize } from '../../src/engine/canvasCalculator';

const size = (value: unknown) =>
  computeCanvasSize({ size: value as string, width: null, height: null });

describe('computeCanvasSize', () => {
  it('handles the presets', () => {
    expect(size('16:9')).toEqual({ width: 1920, height: 1080 });
    expect(size('4:3')).toEqual({ width: 1440, height: 1080 });
  });

  it('handles an explicit WxH', () => {
    expect(size('1600x900')).toEqual({ width: 1600, height: 900 });
  });

  it('derives any ratio', () => {
    expect(size('2:1')).toEqual({ width: 1920, height: 960 });
  });

  it('survives frontmatter values YAML turned into numbers', () => {
    // `size: 1080` / `size: 16.9` 都是合法 YAML，解析出来是 number；
    // 早先直接 .trim() 会抛 TypeError，整页渲染中断
    expect(() => size(1080)).not.toThrow();
    expect(size(1080)).toEqual({ width: 1920, height: 1080 });
    expect(size(16.9)).toEqual({ width: 1920, height: 1080 });
  });

  it('falls back for junk values', () => {
    expect(size('nonsense')).toEqual({ width: 1920, height: 1080 });
    expect(size(null)).toEqual({ width: 1920, height: 1080 });
  });

  it('prefers explicit width/height', () => {
    expect(computeCanvasSize({ size: '4:3', width: 1000, height: 500 })).toEqual({
      width: 1000,
      height: 500,
    });
  });
});

describe('computeRootFontSize', () => {
  it('scales with the canvas width', () => {
    expect(computeRootFontSize({ width: 1920, height: 1080 }, 1, true)).toBe(40);
    expect(computeRootFontSize({ width: 960, height: 540 }, 1, true)).toBe(20);
  });

  it('applies the multiplier and honours the off switch', () => {
    expect(computeRootFontSize({ width: 1920, height: 1080 }, 1.5, true)).toBe(60);
    expect(computeRootFontSize({ width: 960, height: 540 }, 1, false)).toBe(40);
  });
});
