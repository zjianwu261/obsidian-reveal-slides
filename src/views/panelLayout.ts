/**
 * 对话框占面板的比例（纯计算，不依赖 obsidian，可单测）。
 *
 * 存比例而不是像素：同一个数字要在侧边栏、并排标签页、独立窗口里都成立。
 * 写死 220px 的话，高窗口里它是一条缝，矮面板里它吃掉一半。
 */

/** 默认四六开：对话四成，幻灯片六成 */
export const DEFAULT_RATIO = 0.4;

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.7;

/** 比例落在合理区间内；拿不到有效数字（老配置、手改坏了）就退回默认 */
export function clampPanelRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/** 拖动后的像素高度 → 比例 */
export function ratioFromHeight(height: number, containerHeight: number): number {
  if (containerHeight <= 0) return DEFAULT_RATIO;
  return clampPanelRatio(height / containerHeight);
}
