/**
 * ```svg 代码块 → data URI 图片（纯 DOM 操作，不依赖 obsidian）。
 * MarkdownRenderer 已把代码块渲染为 <pre><code class="language-svg">转义后的内容</code></pre>，
 * 仅当反转义后的内容含 <svg 时才转为 <img>，其余保持代码块原样。
 */

/** UTF-8 安全的 base64 编码（插件侧有 Node Buffer，浏览器侧走 btoa 兜底） */
function toBase64(text: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf-8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(text)));
}

/** SVG 源码 → data URI，供 <img src> 使用（figureProcessor 也用这条） */
export function svgToImage(svg: string): string {
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

export function processSvgBlocks(html: string): string {
  if (!html.includes('language-svg')) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  // class 可能带其他标记（如 is-loaded），宽松匹配 language-svg
  doc.querySelectorAll('pre > code[class*="language-svg"]').forEach((code) => {
    // textContent 读取时 HTML 实体自动反转义
    const svg = code.textContent ?? '';
    if (!svg.includes('<svg')) return;

    const img = doc.createElement('img');
    img.setAttribute('class', 'rfo-svg');
    img.setAttribute('src', svgToImage(svg));
    code.closest('pre')?.replaceWith(img);
  });

  return doc.body.innerHTML;
}
