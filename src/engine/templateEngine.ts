import type { RevealConfig } from 'reveal.js';
import type { SlideDeck, SlidePage } from '../types/slide';
import type { PluginSettings } from '../types/config';
import { computeCanvasSize } from './canvasCalculator';
import { escapeHtml } from '../utils/dom';

/** 单页 → <section> HTML */
function renderPageSection(page: SlidePage, deckBg?: string): string {
  const attrs: Record<string, string> = { ...page.attributes };

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
      return `<section>\n${renderPageSection(first, deck.bg)}\n${children}\n</section>`;
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
