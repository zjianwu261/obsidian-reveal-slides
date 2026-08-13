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

/** Grid / Split 占位符前缀（HTML 注释形式，可安全通过 Markdown 渲染器） */
export const GRID_PLACEHOLDER_PREFIX = 'GRID_';
export const SPLIT_PLACEHOLDER_PREFIX = 'SPLIT_';

/** 视频文件扩展名（imageProcessor 包装为 <video>） */
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];
