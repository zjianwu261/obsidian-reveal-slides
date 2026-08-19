/**
 * 代码块交给 reveal 的 highlight 插件之前的归一化（纯 DOM 操作，不依赖 obsidian）。
 *
 * Obsidian 的 MarkdownRenderer 用 Prism 高亮，产出的是
 *   <pre><code class="language-c"><span class="token comment">// …</span>…</code></pre>
 * 而 reveal 的 highlight 插件在高亮前会做一件事（dist/plugin/highlight.mjs）：
 *   if (!code.hasAttribute('data-noescape')) code.innerHTML = code.innerHTML.replace(/</g,'&lt;')…
 * 于是 Prism 的标签被转义成可见文本，观众看到的是一屏 <span class="token comment">，
 * 而且 highlight.js 还会把这堆标签当代码再高亮一遍。
 *
 * 所以这里把代码块还原成纯文本、挂上 data-noescape：
 *   - Prism 的 <span> 丢掉，highlight.js 用 language-* 类重新高亮（配色见 monokai.css）；
 *   - data-noescape 挡住上面那次转义，`#include <reg52.h>` 里的实体不会被二次转义成 &amp;lt;。
 * 顺带删掉 Obsidian 注入的「复制」按钮：投影时既点不到，又占一行位置。
 */

/** 语言标记由别的处理器接管的代码块（已被替换成图/占位，轮不到这里） */
const HANDLED_LANGUAGES = [
  'language-mermaid',
  'language-chart',
  'language-svg',
  'language-figure',
];

export function processCodeBlocks(html: string): string {
  if (!html.includes('<pre')) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('pre > code').forEach((code) => {
    const className = code.getAttribute('class') ?? '';
    if (HANDLED_LANGUAGES.some((lang) => className.includes(lang))) return;

    // textContent 读取时实体自动反转义，赋值时又会转义回去 —— 一来一回正好剥掉 Prism 的标签
    code.textContent = code.textContent ?? '';
    code.setAttribute('data-noescape', '');
  });

  doc.querySelectorAll('pre .copy-code-button').forEach((button) => button.remove());

  return doc.body.innerHTML;
}
