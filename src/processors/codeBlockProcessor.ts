/**
 * 代码块的渲染后处理（客户端，运行在预览 iframe 内）：重新高亮 + 长代码自适应。
 *
 * 长代码自适应：渲染完成后对 .grid 内的 <pre> 测量溢出：
 *   1. 从当前字号逐步递减 font-size / line-height（线性，步进 0.5px，下限 10px）
 *   2. 仍溢出则用 transform: scale() 兜底（transform-origin: top left）
 * 不溢出的保持原样（grid 默认 flex 居中由 CSS 处理）。
 *
 * 注意：此文件运行在浏览器环境，不得 import 'obsidian'。
 */

/** 字号下限（px） */
const MIN_FONT_SIZE = 10;
/** 线性递减步进（px） */
const FONT_STEP = 0.5;

function fits(pre: HTMLElement, container: HTMLElement): boolean {
  return pre.scrollHeight <= container.clientHeight && pre.scrollWidth <= container.clientWidth;
}

function fitCodeBlock(pre: HTMLElement, container: HTMLElement): void {
  if (fits(pre, container)) return;

  const computed = getComputedStyle(pre);
  let fontSize = parseFloat(computed.fontSize) || 16;
  let lineHeight = parseFloat(computed.lineHeight) || fontSize * 1.4;

  while (!fits(pre, container) && fontSize > MIN_FONT_SIZE) {
    fontSize = Math.max(MIN_FONT_SIZE, fontSize - FONT_STEP);
    lineHeight = Math.max(MIN_FONT_SIZE, lineHeight - FONT_STEP);
    pre.style.fontSize = `${fontSize}px`;
    pre.style.lineHeight = `${lineHeight}px`;
  }

  // 到下限仍溢出：transform 缩放兜底
  if (!fits(pre, container)) {
    const scale = Math.min(
      container.clientHeight / (pre.scrollHeight || 1),
      container.clientWidth / (pre.scrollWidth || 1),
    );
    if (scale > 0 && scale < 1) {
      pre.style.transform = `scale(${scale})`;
      pre.style.transformOrigin = 'top left';
    }
  }
}

/**
 * 重新高亮 root 下尚未高亮的代码块。
 *
 * reveal 的 highlight 插件只在 Reveal.initialize() 时扫一遍 pre code，之后不再过问；
 * 而本插件每次刷新预览都把 .slides 的 innerHTML 整体重建。于是首屏代码是彩色的，
 * 源文件一改（哪怕只动一个字）重渲染，整屏代码就退回灰白 —— 编辑时看到的几乎全是灰的。
 * 这里在每次重渲染后补上那一遍。
 *
 * @param highlightBlock reveal highlight 插件的 highlightBlock（注入进来，便于测试）
 */
export function highlightCodeBlocks(
  root: ParentNode,
  highlightBlock: (block: HTMLElement) => void,
): void {
  root.querySelectorAll<HTMLElement>('pre > code').forEach((code) => {
    // hljs 高亮完会给元素挂上 .hljs。首屏这些块插件已经染过，再染一遍等于把上一轮
    // 的 <span class="hljs-..."> 当源码重新分词，颜色全乱
    if (code.classList.contains('hljs')) return;
    // 插件 init 里给每个 pre 加的类，这里一并补上，首屏与之后的 DOM 保持一致
    code.parentElement?.classList.add('code-wrapper');
    highlightBlock(code);
  });
}

/** 对 root 下每个 .grid 内的 <pre> 做自适应缩放 */
export function fitCodeBlocks(root: ParentNode): void {
  root.querySelectorAll('.grid').forEach((grid) => {
    const container = grid as HTMLElement;
    container.querySelectorAll('pre').forEach((pre) => {
      fitCodeBlock(pre as HTMLElement, container);
    });
  });
}
