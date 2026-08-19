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

/** 输入框最矮两行，再矮就看不见自己在打什么 */
export const MIN_INPUT_HEIGHT = 48;

/**
 * 输入框该多高（纯计算，可单测）。
 *
 * 跟着内容长，但有两条边：矮不过两行，高不过面板的四成 ——
 * 长文一贴就把对话记录顶没了的话，你就看不见上一轮回复在说什么。
 */
export function inputHeight(contentHeight: number, panelHeight: number): number {
  const max = Math.max(MIN_INPUT_HEIGHT, panelHeight * 0.4);
  return Math.round(Math.min(Math.max(contentHeight, MIN_INPUT_HEIGHT), max));
}

/**
 * 拖出来的高度 → 该记住的值。拖回最矮（含误差）就是 0：退回「跟着内容长」。
 * 手动挡一旦挂上就摘不掉的话，改坏了没地方复位。
 */
export function heightToRemember(dragged: number): number {
  return dragged <= MIN_INPUT_HEIGHT + 4 ? 0 : Math.round(dragged);
}

/** 对话框输入区的按键处理（纯判断，可单测） */
export type ChatKeyAction =
  | 'send'
  | 'newline'
  | 'pass'
  /** 斜杠菜单：往下挪一格 */
  | 'menu-next'
  /** 斜杠菜单：往上挪一格 */
  | 'menu-prev'
  /** 斜杠菜单：选中当前这条 */
  | 'menu-accept'
  /** 斜杠菜单：关掉，回到普通输入 */
  | 'menu-close';

export interface ChatKeyEvent {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  /** 输入法正在拼字：这时的 Enter 是「确认候选词」，绝不能当成发送 */
  isComposing: boolean;
}

/**
 * @param menuOpen 斜杠菜单是否正开着 —— 开着的时候上下键归菜单，Enter 是「选这条」而不是发送
 */
export function chatKeyAction(event: ChatKeyEvent, menuOpen = false): ChatKeyAction {
  // 中文输入法正在拼字：Enter 是上屏，上下键是翻候选词，一概不抢
  if (event.isComposing) return 'pass';

  if (menuOpen) {
    if (event.key === 'ArrowDown') return 'menu-next';
    if (event.key === 'ArrowUp') return 'menu-prev';
    if (event.key === 'Escape') return 'menu-close';
    // Tab 只认不带 Shift 的：Shift + Tab 是往回跳焦点，抢了会让人跳不出输入框
    if (event.key === 'Tab' && !event.shiftKey) return 'menu-accept';
    // 菜单开着时 Enter 是「选这条」。裸着发一句 /图 给模型没有意义，
    // 但 Alt/Shift + Enter 仍然是换行 —— 那是在写内容，不是在挑命令
    if (event.key === 'Enter' && !event.altKey && !event.shiftKey) return 'menu-accept';
  }

  if (event.key !== 'Enter') return 'pass';
  if (event.altKey || event.shiftKey) return 'newline';
  return 'send';
}
