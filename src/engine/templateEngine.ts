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
 * 渲染独立可播放的单文件 HTML（Task 5.2）。
 * CSS / bundle JS 全部内联，deck 通过 window.__DECK__ 全局注入，
 * 客户端（reveal-bundle.ts）检测到 __DECK__ 后不再 fetch / 不连 SSE，可离线播放。
 */
export function renderStandalonePage(deck: SlideDeck, assets: StandaloneAssets): string {
  // "</" 会提前闭合内联 <script>，JSON 中转义为 "<\/"（字符串内 \/ === /，安全）
  const deckJson = JSON.stringify(deck).replace(/<\//g, '<\\/');
  // bundle 内字符串/正则字面量可能含 "</script"，同样转义（JS 中 \/ === /）
  const bundleJs = assets.bundleJs.replace(/<\/script/gi, '<\\/script');
  const title = escapeHtml(deck.title || 'Slide Preview');

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
  <script>window.__DECK__ = ${deckJson};</script>
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
