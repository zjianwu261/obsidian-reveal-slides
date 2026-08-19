/**
 * ```figure 代码块 → SVG 图（纯 DOM 操作，不依赖 obsidian）。
 *
 * 笔记里写十来行 JSON 声明，这里渲染成图 —— 作者不必手写 SVG，也不必把渲染结果
 * 粘回笔记：改一个字段存盘，预览立刻重画。渲染逻辑见 src/figure。
 *
 * 输出沿用 svgProcessor 的形式（data URI 的 <img class="rfo-svg">），这样导出 HTML、
 * PPTX、图片时的既有处理一概照旧。
 *
 * 声明写错时**保留原代码块**：JSON 拼错、type 打错，作者在幻灯片上直接看见自己那段
 * JSON，比一个语焉不详的错误框好排查。
 */
import type { FigureSpec } from '../figure/types';
import { renderFigure } from '../figure/render';
import { svgToImage } from './svgProcessor';

/** 代码块文本 → 声明；解析失败返回 null */
export function parseFigureSpec(text: string): FigureSpec | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof (parsed as { type?: unknown }).type !== 'string') return null;
    return parsed as FigureSpec;
  } catch {
    return null;
  }
}

export function processFigureBlocks(html: string): string {
  if (!html.includes('language-figure')) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('pre > code[class*="language-figure"]').forEach((code) => {
    const spec = parseFigureSpec(code.textContent ?? '');
    if (!spec) return;

    const svg = renderFigure(spec);
    if (!svg) return;

    const img = doc.createElement('img');
    img.setAttribute('class', 'rfo-svg');
    img.setAttribute('src', svgToImage(svg));
    code.closest('pre')?.replaceWith(img);
  });

  return doc.body.innerHTML;
}
