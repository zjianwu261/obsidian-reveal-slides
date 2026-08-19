/**
 * 数学公式：把 $...$ / $$...$$ 从正文里摘出来，渲染后换成占位元素，交给 iframe 里的
 * MathJax 现场排版（客户端渲染见 engine/mathRenderer）。
 *
 * ⚠️ 为什么不直接用 Obsidian 渲染好的公式：
 * Obsidian 用的是 MathJax 的 CHTML 输出，产物形如
 *   <mjx-container><mjx-math><mjx-mi><mjx-c class="mjx-c1D43C"></mjx-c>…
 * 字形不在元素里，而是靠一张样式表的 `.mjx-c1D43C::before { content: "\1D43C" }`
 * 逐个补出来的 —— 那张表由 MathJax 注入 Obsidian 自己的文档，且随用到的字符**动态增补**。
 * 预览是独立的 iframe，拿不到这张表，于是整串 <mjx-*> 全是空元素：公式位置什么都不显示。
 * 配套的 woff 字体还封在 Obsidian 的 asar 里，路径也带不过来。
 * 所以这里走 Mermaid / Chart.js 那条老路：管线只留占位符，真正的排版在 iframe 里做。
 *
 * ⚠️ 必须在**渲染之前**摘走：否则进 MarkdownRenderer 的公式就变成上面那堆空元素了。
 *
 * ⚠️ 本文件不得 import 'path' 等 Node 内置模块：移动端会加载它。
 */
import { replaceOutsideCode } from '../utils/codeRanges';

export interface MathBlock {
  /** 原始 TeX（不含 $ 定界符） */
  tex: string;
  /** true = $$...$$ 独占一行的块级公式 */
  display: boolean;
}

export interface MathExtractResult {
  /** 公式已换成 ⟦RFO-MATH-n⟧ 标记的文本 */
  text: string;
  maths: MathBlock[];
}

const TOKEN_PREFIX = '⟦RFO-MATH-';
const TOKEN_CLOSE = '⟧';
const TOKEN_RE = /⟦RFO-MATH-(\d+)⟧/g;

const token = (index: number) => `${TOKEN_PREFIX}${index}${TOKEN_CLOSE}`;

/** $$...$$ 块级公式（可跨行） */
const DISPLAY_RE = /\$\$([\s\S]+?)\$\$/g;

/**
 * $...$ 行内公式。
 * 前面那一位捕获组是用来挡住转义的 \$ 的（写价格时 `\$5` 很常见）；
 * 内容不跨行、且首尾不是空白 —— 「$100 到 $200」这种两个价格夹一段话的写法
 * 才不会被当成一个公式整段吃掉。
 */
const INLINE_RE = /(^|[^\\$])\$([^\n$]+?)\$/g;

/** 行内公式的内容约束：非空，且首尾非空白 */
function isInlineMath(tex: string): boolean {
  return tex.length > 0 && !/^\s/.test(tex) && !/\s$/.test(tex);
}

/**
 * 渲染前：公式 → 文本标记。
 * 代码块里的 $ 是示例或 shell 提示符，replaceOutsideCode 会整段跳过。
 */
export function extractMath(markdown: string): MathExtractResult {
  if (!markdown.includes('$')) return { text: markdown, maths: [] };

  const maths: MathBlock[] = [];

  // 先块级后行内：$$ 摘干净了，剩下的单个 $ 才好按行内匹配
  let text = replaceOutsideCode(markdown, DISPLAY_RE, (whole, tex) => {
    const body = (tex ?? '').trim();
    if (!body) return whole;
    maths.push({ tex: body, display: true });
    return token(maths.length - 1);
  });

  text = replaceOutsideCode(text, INLINE_RE, (whole, lead, tex) => {
    const body = tex ?? '';
    if (!isInlineMath(body)) return whole;
    maths.push({ tex: body, display: false });
    return `${lead ?? ''}${token(maths.length - 1)}`;
  });

  return { text, maths };
}

/** 占位元素：客户端据此调 MathJax，data-tex 存原始 TeX */
function createPlaceholder(doc: Document, math: MathBlock): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'rfo-math';
  span.setAttribute('data-tex', math.tex);
  if (math.display) span.setAttribute('data-display', 'true');
  // 排版前先摆原文：MathJax 没跑起来（或这条公式写错了）时，屏幕上至少还有东西看
  span.textContent = math.display ? `$$${math.tex}$$` : `$${math.tex}$`;
  return span;
}

/** 递归收集含标记的文本节点 */
function collectTokenNodes(node: Node, out: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    if ((node.textContent ?? '').includes(TOKEN_PREFIX)) out.push(node as Text);
    return;
  }
  Array.from(node.childNodes).forEach((child) => collectTokenNodes(child, out));
}

/** 渲染后：标记 → <span class="rfo-math">占位元素 */
export function applyMath(html: string, maths: MathBlock[] = []): string {
  if (maths.length === 0 || !html.includes(TOKEN_PREFIX)) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');

  const textNodes: Text[] = [];
  collectTokenNodes(doc.body, textNodes);

  for (const node of textNodes) {
    const parent = node.parentNode;
    if (!parent) continue;

    const fragment = doc.createDocumentFragment();
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_RE.exec(node.data)) !== null) {
      const math = maths[Number(match[1])];
      if (!math) continue;
      if (match.index > last) {
        fragment.appendChild(doc.createTextNode(node.data.slice(last, match.index)));
      }
      fragment.appendChild(createPlaceholder(doc, math));
      last = match.index + match[0].length;
    }

    if (last === 0) continue;
    if (last < node.data.length) {
      fragment.appendChild(doc.createTextNode(node.data.slice(last)));
    }
    parent.replaceChild(fragment, node);
  }

  // 标记也可能被渲染器抄进属性里（Obsidian 的 <h2 data-heading="…⟦tok⟧">），
  // 文本节点那轮清不到，这里统一抹掉 —— 留着会在大纲、导出里露出乱码
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (!attr.value.includes(TOKEN_PREFIX)) continue;
      el.setAttribute(
        attr.name,
        attr.value.replace(TOKEN_RE, (_m, n: string) => maths[Number(n)]?.tex ?? ''),
      );
    }
  });

  return doc.body.innerHTML;
}
