import type { PluginSettings } from '../types/config';
import { CANVAS_BASE_WIDTH, CANVAS_PRESETS } from '../constants';

export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * 根据设置计算画布尺寸。
 * 优先级: width/height 显式值 > size 的 "WxH" 显式值 > 预设比例 > "W:H" 任意比例。
 */
export function computeCanvasSize(settings: Pick<PluginSettings, 'size' | 'width' | 'height'>): CanvasSize {
  if (settings.width && settings.height) {
    return { width: settings.width, height: settings.height };
  }

  // frontmatter 是用户手写的，`size: 1080`、`size: 16.9` 都会被 YAML 解析成数字，
  // 直接 .trim() 会抛 TypeError 把整页渲染打断 —— 一律转成字符串再解析
  const size = String(settings.size ?? '16:9').trim();

  const explicit = /^(\d+)\s*x\s*(\d+)$/i.exec(size);
  if (explicit) {
    return { width: Number(explicit[1]), height: Number(explicit[2]) };
  }

  const preset = CANVAS_PRESETS[size];
  if (preset) {
    return { width: preset[0], height: preset[1] };
  }

  const ratio = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(size);
  if (ratio) {
    const w = CANVAS_BASE_WIDTH;
    const h = Math.round((w * Number(ratio[2])) / Number(ratio[1]));
    return { width: w, height: h };
  }

  return { width: CANVAS_PRESETS['16:9'][0], height: CANVAS_PRESETS['16:9'][1] };
}

/** 根字号：画布宽度基准 40px @ 1920，乘以整体倍率 */
export function computeRootFontSize(canvas: CanvasSize, fontScale: number, autoFontScale: boolean): number {
  const base = autoFontScale ? (canvas.width / CANVAS_BASE_WIDTH) * 40 : 40;
  return base * fontScale;
}
