/**
 * 对话框占面板的比例（纯计算，不依赖 obsidian，可单测）。
 *
 * 存比例而不是像素：同一个数字要在侧边栏、并排标签页、独立窗口里都成立。
 * 写死 220px 的话，高窗口里它是一条缝，矮面板里它吃掉一半。
 */

/** 默认三七开：对话三成，幻灯片七成 */
export const DEFAULT_RATIO = 0.3;

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

/** 对话框输入区的按键处理（纯判断，可单测） */
export type ChatKeyAction = 'send' | 'newline' | 'pass';

export interface ChatKeyEvent {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  /** 输入法正在拼字：这时的 Enter 是「确认候选词」，绝不能当成发送 */
  isComposing: boolean;
}

export function chatKeyAction(event: ChatKeyEvent): ChatKeyAction {
  if (event.key !== 'Enter') return 'pass';
  // 中文输入法选词时按 Enter 是上屏，不是发送 —— 不判这一条，打一半就会被发出去
  if (event.isComposing) return 'pass';
  if (event.altKey || event.shiftKey) return 'newline';
  return 'send';
}
