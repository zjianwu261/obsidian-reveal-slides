/**
 * data-background-* 属性处理：把 <!-- .slide: --> 解析出的背景属性
 * 规范化为 reveal.js 认识的 <section> 属性。
 */

const BACKGROUND_KEYS: Record<string, string> = {
  'background': 'data-background-image',
  'background-image': 'data-background-image',
  'background-color': 'data-background-color',
  'background-size': 'data-background-size',
  'background-position': 'data-background-position',
  'background-repeat': 'data-background-repeat',
  'background-opacity': 'data-background-opacity',
  'background-transition': 'data-background-transition',
  'background-video': 'data-background-video',
  'background-iframe': 'data-background-iframe',
};

/** 把属性表中的背景键转换为 data-background-* 形式（其余键原样保留） */
export function normalizeSlideAttributes(attrs: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const mapped = BACKGROUND_KEYS[key] ?? (key.startsWith('data-') ? key : key);
    normalized[mapped] = value;
  }
  return normalized;
}
