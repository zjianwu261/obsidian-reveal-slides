/**
 * 对话框高度的约束（纯计算，不依赖 obsidian，可单测）。
 * 太矮看不到回复，太高幻灯片就没地方了。
 */

const MIN_HEIGHT = 90;
const MAX_RATIO = 0.7;

/** 拖动后的高度落在合理区间内 */
export function clampPanelHeight(height: number, containerHeight: number): number {
  const max = Math.max(MIN_HEIGHT, containerHeight * MAX_RATIO);
  return Math.round(Math.min(max, Math.max(MIN_HEIGHT, height)));
}
