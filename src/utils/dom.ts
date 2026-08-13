/** 转义 HTML 特殊字符 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 将 DOM 元素序列化为 HTML 字符串（含子节点） */
export function elementToHtml(el: HTMLElement): string {
  return el.innerHTML;
}
