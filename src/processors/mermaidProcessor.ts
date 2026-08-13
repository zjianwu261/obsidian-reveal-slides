/**
 * ```mermaid 代码块 → 客户端渲染占位（纯 DOM 操作，不依赖 obsidian）。
 * MarkdownRenderer 已把代码块渲染为 <pre><code class="language-mermaid">转义后的源码</code></pre>，
 * 这里转成 <div class="rfo-mermaid"> 占位，真正的 SVG 渲染由 iframe 客户端
 * （reveal-bundle.ts 的 mermaid.run）完成。
 */

export function processMermaidBlocks(html: string): string {
  if (!html.includes('language-mermaid')) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  // class 可能带其他标记（如 is-loaded），宽松匹配 language-mermaid
  doc.querySelectorAll('pre > code[class*="language-mermaid"]').forEach((code) => {
    const source = code.textContent ?? '';
    if (!source.trim()) return;

    const div = doc.createElement('div');
    div.setAttribute('class', 'rfo-mermaid');
    // textContent 赋值序列化时自动 HTML 转义，客户端 mermaid.run 读取时还原
    div.textContent = source;
    code.closest('pre')?.replaceWith(div);
  });

  return doc.body.innerHTML;
}
