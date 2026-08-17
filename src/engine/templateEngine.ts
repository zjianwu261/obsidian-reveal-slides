import type { RevealConfig } from 'reveal.js';
import type { SlideDeck, SlidePage } from '../types/slide';
import type { PluginSettings } from '../types/config';
import { computeCanvasSize } from './canvasCalculator';
import { escapeHtml } from '../utils/dom';

/** 页面是否用 <grid> 定位：这类页要按固定画布渲染（见 grid.scss 的 .rfo-canvas） */
function usesCanvasLayout(page: SlidePage): boolean {
  return /class="grid[\s"]/.test(page.html);
}

/** 追加 class 而不丢掉 <!-- .slide: class="..." --> 写入的值 */
function addClass(attrs: Record<string, string>, className: string): void {
  attrs.class = attrs.class ? `${attrs.class} ${className}` : className;
}

/** 单页 → <section> HTML */
function renderPageSection(page: SlidePage, deckBg?: string): string {
  const attrs: Record<string, string> = { ...page.attributes };
  if (usesCanvasLayout(page)) addClass(attrs, 'rfo-canvas');

  const bg = page.background ?? deckBg;
  if (bg) {
    if (/^(#|rgb|hsl|[a-z]+$)/i.test(bg) && !/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(bg)) {
      attrs['data-background-color'] = bg;
    } else {
      attrs['data-background-image'] = bg;
    }
  }

  const attrString = Object.entries(attrs)
    .map(([key, value]) => ` ${escapeHtml(key)}="${escapeHtml(value)}"`)
    .join('');

  const notes = page.notes
    .map((note) => `<aside class="notes">${note.content}</aside>`)
    .join('\n');

  return `<section${attrString}>\n${page.html}\n${notes}\n</section>`;
}

/**
 * SlideDeck.pages（扁平数组）→ reveal.js 嵌套 <section> 结构。
 * 约定：vertical 页归属于前一个 horizontal 页。
 */
export function buildSectionsHtml(deck: SlideDeck): string {
  const groups: SlidePage[][] = [];
  for (const page of deck.pages) {
    if (page.type === 'vertical' && groups.length > 0) {
      groups[groups.length - 1].push(page);
    } else {
      groups.push([page]);
    }
  }

  return groups
    .map((group) => {
      if (group.length === 1) {
        return renderPageSection(group[0], deck.bg);
      }
      const [first, ...rest] = group;
      const children = rest.map((page) => renderPageSection(page, deck.bg)).join('\n');
      // 子页的 height: 100% 要落在有确定高度的父 section 上，故外层同样标记
      const stackClass = group.some(usesCanvasLayout) ? ' class="rfo-canvas"' : '';
      return `<section${stackClass}>\n${renderPageSection(first, deck.bg)}\n${children}\n</section>`;
    })
    .join('\n');
}

/** 扁平页序号 → reveal 的 [水平, 垂直] 坐标（与 buildSectionsHtml 的分组保持一致） */
export function pageIndexToPosition(deck: SlideDeck, pageIndex: number): { h: number; v: number } {
  let h = -1;
  let v = 0;
  for (let i = 0; i <= pageIndex && i < deck.pages.length; i++) {
    if (deck.pages[i].type === 'vertical' && h >= 0) {
      v++;
    } else {
      h++;
      v = 0;
    }
  }
  return { h: Math.max(h, 0), v };
}

/**
 * reveal 的 [水平, 垂直] 坐标 → 扁平页序号（pageIndexToPosition 的逆运算）。
 * 该坐标不存在（h 越界）返回 -1；只有 v 越界时退回该横向组的首页。
 */
export function positionToPageIndex(deck: SlideDeck, h: number, v = 0): number {
  let groupStart = -1;
  let curH = -1;
  let curV = 0;

  for (let i = 0; i < deck.pages.length; i++) {
    if (deck.pages[i].type === 'vertical' && curH >= 0) {
      curV++;
    } else {
      curH++;
      curV = 0;
    }

    if (curH > h) break;
    if (curH < h) continue;
    if (groupStart < 0) groupStart = i;
    if (curV === v) return i;
  }

  return groupStart;
}

/**
 * 源码行号 → 页序号：取起始行不超过该行的最后一页。
 * 页按 sourceLine 递增排列，光标落在页与页之间的空白处时归属上一页。
 */
export function lineToPageIndex(deck: SlideDeck, line: number): number {
  let found = 0;
  for (let i = 0; i < deck.pages.length; i++) {
    if (deck.pages[i].sourceLine <= line) found = i;
    else break;
  }
  return found;
}

/** SlideDeck.config → reveal.js 初始化配置（不含插件） */
export function buildRevealConfig(deck: SlideDeck): RevealConfig {
  const config = deck.config;
  const canvas = computeCanvasSize({
    size: config.size ?? '16:9',
    width: config.width ?? null,
    height: config.height ?? null,
  });

  return {
    hash: true,
    slideNumber: (config.slideNumber ?? true) as RevealConfig['slideNumber'],
    controls: config.controls ?? true,
    progress: config.progress ?? true,
    center: config.center ?? true,
    overview: config.enableOverview ?? true,
    transition: (config.transition ?? 'slide') as RevealConfig['transition'],
    transitionSpeed: (config.transitionSpeed ?? 'default') as RevealConfig['transitionSpeed'],
    margin: config.margin ?? 0.04,
    width: canvas.width,
    height: canvas.height,
    // null 禁用移动端自动滚动视图（类型声明为 number，运行时空值即关闭）
    scrollActivationWidth: (config.scrollActivationWidth ?? null) as unknown as number,
  };
}

/** 渲染用完整页面（服务器 /reveal.html 路由） */
export function renderPage(template: string, deck: SlideDeck): string {
  return template.replace(/\{\{TITLE\}\}/g, escapeHtml(deck.title || 'Slide Preview'));
}

/** 独立导出需要的静态资源文本（由导出器从 dist/assets 读入后内联） */
export interface StandaloneAssets {
  resetCss: string;
  revealCss: string;
  highlightCss: string;
  pluginCss: string;
  bundleJs: string;
}

/**
 * 内联预览用的空壳页面（移动端走这条路：没有 Node，起不了 HTTP 服务器）。
 * 资源全部内联，但不带 deck —— 客户端起来后等宿主 postMessage 推送，
 * 之后每次更新只发消息，不必重建整个页面（bundle 有好几 MB）。
 */
export function renderInlineShell(assets: StandaloneAssets): string {
  return renderStandalonePage(null, assets);
}

/**
 * 渲染独立可播放的单文件 HTML（Task 5.2）。
 * CSS / bundle JS 全部内联，deck 通过 window.__DECK__ 全局注入，
 * 客户端（reveal-bundle.ts）检测到 __DECK__ 后不再 fetch / 不连 SSE，可离线播放。
 * deck 传 null 则生成空壳，客户端改为等待 postMessage（见 renderInlineShell）。
 */
export function renderStandalonePage(deck: SlideDeck | null, assets: StandaloneAssets): string {
  // "</" 会提前闭合内联 <script>，JSON 中转义为 "<\/"（字符串内 \/ === /，安全）
  const deckScript = deck
    ? `<script>window.__DECK__ = ${JSON.stringify(deck).replace(/<\//g, '<\\/')};</script>`
    : '<script>window.__RFO_INLINE__ = true;</script>';
  // bundle 内字符串/正则字面量可能含 "</script"，同样转义（JS 中 \/ === /）
  const bundleJs = assets.bundleJs.replace(/<\/script/gi, '<\\/script');
  const title = escapeHtml(deck?.title || 'Slide Preview');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
${assets.resetCss}
  </style>
  <style>
${assets.revealCss}
  </style>
  <style>
${assets.highlightCss}
  </style>
  <style>
${assets.pluginCss}
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides"></div>
  </div>
  ${deckScript}
  <script type="module">
${bundleJs}
  </script>
</body>
</html>
`;
}

/** 文档级 CSS / 远程 CSS 注入片段（客户端渲染时插入 <head>） */
export function buildExtraCssHtml(deck: SlideDeck): string {
  const parts: string[] = [];
  for (const url of deck.remoteCSS ?? []) {
    parts.push(`<link rel="stylesheet" href="${escapeHtml(url)}">`);
  }
  if (deck.cssVariables) {
    parts.push(`<style id="reveal-doc-css">\n${deck.cssVariables}\n</style>`);
  }
  return parts.join('\n');
}

export type { PluginSettings };
