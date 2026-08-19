/** 视图类型 ID */
export const VIEW_TYPE_SLIDE_PREVIEW = 'reveal-slide-preview';

/** 画布基准值：按比例尺寸推导出的默认画布宽度 */
export const CANVAS_BASE_WIDTH = 1920;

/** 画布比例预设 → [width, height] */
export const CANVAS_PRESETS: Record<string, [number, number]> = {
  '16:9': [1920, 1080],
  '4:3': [1440, 1080],
  '21:9': [2520, 1080],
};

/**
 * Grid 占位符。
 *
 * ⚠️ 不能用 HTML 注释：Obsidian 的 MarkdownRenderer 会把 `<!-- ... -->` 整段丢弃，
 * 而一页正文在解析后往往只剩占位符，渲染结果就成了空字符串（整页空白）。
 * 改用普通文本标记 —— 渲染器当普通文字原样保留，之后再字符串替换。
 * 生僻方括号避免与正文撞车，内部只有字母/数字/连字符，不触发任何 Markdown 行内语法。
 */
export const GRID_PLACEHOLDER_PREFIX = '⟦RFO-GRID-';
export const PLACEHOLDER_CLOSE = '⟧';

/** 占位符文本 */
export function gridPlaceholder(index: number): string {
  return `${GRID_PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_CLOSE}`;
}


/** 视频文件扩展名（imageProcessor 包装为 <video>） */
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];
