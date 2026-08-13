/**
 * 长代码自适应（客户端 JS 测量，运行在预览 iframe 内）。
 * 渲染完成后对 .grid 内的 <pre> 测量溢出：
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

/** 对 root 下每个 .grid 内的 <pre> 做自适应缩放 */
export function fitCodeBlocks(root: ParentNode): void {
  root.querySelectorAll('.grid').forEach((grid) => {
    const container = grid as HTMLElement;
    container.querySelectorAll('pre').forEach((pre) => {
      fitCodeBlock(pre as HTMLElement, container);
    });
  });
}
