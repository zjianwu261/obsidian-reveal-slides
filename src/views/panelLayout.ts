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
