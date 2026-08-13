/**
 * 预览 iframe 内的客户端运行时。
 * 由 esbuild 打包为 dist/assets/reveal.bundle.mjs（ESM），
 * 负责拉取 /deck、渲染 <section>、初始化 reveal.js，并通过 SSE 实时刷新。
 *
 * 注意：此文件运行在浏览器环境，不得 import 'obsidian'。
 */
import Reveal from 'reveal.js';
import type { RevealApi } from 'reveal.js';
import RevealNotes from 'reveal.js/plugin/notes';
import RevealHighlight from 'reveal.js/plugin/highlight';
import RevealMath from 'reveal.js/plugin/math';
import RevealZoom from 'reveal.js/plugin/zoom';
import mermaid from 'mermaid';
import Chart from 'chart.js/auto';
import type { SlideDeck } from '../types/slide';
import {
  buildSectionsHtml,
  buildRevealConfig,
  buildExtraCssHtml,
  pageIndexToPosition,
} from './templateEngine';
import { computeCanvasSize, computeRootFontSize } from './canvasCalculator';
import { applyScrollViewGuard } from './scrollViewHandler';
import { fitCodeBlocks } from '../processors/codeBlockProcessor';

declare global {
  interface Window {
    /** HTML 独立导出时全局注入的 SlideDeck；存在则不 fetch /deck、不连 SSE */
    __DECK__?: SlideDeck;
    /** 内联预览（移动端 blob 页面）：deck 由宿主 postMessage 推送 */
    __RFO_INLINE__?: boolean;
  }
}

/** 内联模式下由宿主推来的 deck */
let pushedDeck: SlideDeck | null = null;

let deck: RevealApi | null = null;
let renderTimer: number | null = null;
/** 最近一次渲染用的 deck 数据（goto 时换算页坐标要用） */
let current: SlideDeck | null = null;

/**
 * 把已知的晦涩报错翻译成能照做的提示。
 * reveal.js 的 notes 插件开演讲者视图时先用 `w.marked = ...` 再判 `!w`，
 * 弹窗被拦时 window.open 返回 null，就抛出 "Cannot set properties of null (setting 'marked')"。
 */
function explain(message: string): string {
  if (message.includes("setting 'marked'")) {
    return (
      'Speaker view could not open its window (popup blocked). ' +
      'Reopen the preview panel so the iframe picks up popup permission, then press S again.'
    );
  }
  return message;
}

/** 错误浮层：iframe 内的任何失败都直接显示出来，避免“白屏无提示” */
function showError(message: string): void {
  let overlay = document.getElementById('rfo-error');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rfo-error';
    overlay.style.cssText =
      'position:fixed;inset:auto 0 0 0;z-index:9999;padding:12px 16px;' +
      'background:#c0392b;color:#fff;font:14px/1.5 monospace;white-space:pre-wrap;';
    document.body.appendChild(overlay);
  }
  overlay.textContent = `[reveal-for-obsidian] ${explain(message)}`;
}

window.addEventListener('error', (event) => showError(event.message));
window.addEventListener('unhandledrejection', (event) => showError(String(event.reason)));

// Mermaid 全局初始化一次；插件侧把 ```mermaid 转成 <div class="rfo-mermaid"> 占位，
// 每次 render 后用 mermaid.run 渲染为 SVG
mermaid.initialize({ startOnLoad: false, theme: 'default' });

/**
 * deck 的三个来源：
 *   1. window.__DECK__      独立导出的单文件 HTML
 *   2. postMessage          内联预览（移动端没有 Node，起不了服务器）
 *   3. GET /deck            桌面端的本地预览服务器
 */
async function loadDeck(): Promise<SlideDeck> {
  if (window.__DECK__) return window.__DECK__;
  if (window.__RFO_INLINE__) {
    if (!pushedDeck) throw new Error('waiting for deck');
    return pushedDeck;
  }
  const res = await fetch('/deck', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch deck: ${res.status}`);
  return res.json() as Promise<SlideDeck>;
}

/** 内联模式：监听宿主推送的 deck 与跳页指令 */
function connectHost(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; deck?: SlideDeck; page?: number } | null;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'deck' && data.deck) {
      pushedDeck = data.deck;
      scheduleRender();
      return;
    }
    if (data.type === 'goto' && typeof data.page === 'number') {
      gotoPage(data.page);
    }
  });
  // 告诉宿主「我准备好了」，宿主收到后把当前 deck 推过来
  window.parent?.postMessage({ type: 'rfo-ready' }, '*');
}

function injectExtraCss(data: SlideDeck): void {
  document.head.querySelectorAll('[data-reveal-extra]').forEach((el) => el.remove());
  const wrapper = document.createElement('template');
  wrapper.innerHTML = buildExtraCssHtml(data);
  wrapper.content.querySelectorAll('link,style').forEach((el) => {
    (el as HTMLElement).setAttribute('data-reveal-extra', '');
    document.head.appendChild(el);
  });
  document.title = data.title || 'Slide Preview';
}

/** 画布尺寸与根字号写入 CSS 变量（canvas.scss 的 --root-font-size 由此驱动） */
function applyCanvasVariables(data: SlideDeck): void {
  const canvas = computeCanvasSize({
    size: data.config.size ?? '16:9',
    width: data.config.width ?? null,
    height: data.config.height ?? null,
  });
  const rootFontSize = computeRootFontSize(
    canvas,
    data.config.fontScale ?? 1,
    data.config.autoFontScale ?? true,
  );
  const style = document.documentElement.style;
  style.setProperty('--canvas-width', String(canvas.width));
  style.setProperty('--canvas-height', String(canvas.height));
  style.setProperty('--root-font-size', `${rootFontSize}px`);
}

/** 插件侧 chartProcessor 生成的 <canvas class="rfo-chart" data-chart="..."> → Chart.js 实例 */
function hydrateCharts(): void {
  document.querySelectorAll<HTMLCanvasElement>('canvas.rfo-chart').forEach((canvas) => {
    const raw = canvas.getAttribute('data-chart');
    if (!raw) return;
    try {
      // 每次 render 后 innerHTML 整体重建，canvas 均为新节点，直接实例化即可
      new Chart(canvas, JSON.parse(raw));
    } catch (err) {
      console.error('[reveal-for-obsidian] chart render failed', err);
    }
  });
}

/** 插件侧 mermaidProcessor 生成的 <div class="rfo-mermaid"> → SVG */
async function hydrateMermaid(): Promise<void> {
  const nodes = document.querySelectorAll<HTMLElement>('.rfo-mermaid');
  if (nodes.length === 0) return;
  try {
    await mermaid.run({ nodes });
  } catch (err) {
    // 单个图语法错误不应拖垮整个渲染
    console.error('[reveal-for-obsidian] mermaid render failed', err);
  }
}

/** 跳到指定页（编辑器光标跟随）；已在该页则不动，避免打断翻页动画 */
function gotoPage(pageIndex: number): void {
  if (!deck || !current) return;
  const target = pageIndexToPosition(current, pageIndex);
  const now = deck.getIndices();
  if (now.h === target.h && (now.v ?? 0) === target.v) return;
  deck.slide(target.h, target.v);
}

async function render(): Promise<void> {
  const data = await loadDeck();
  current = data;
  const slidesEl = document.querySelector<HTMLElement>('.slides');
  if (!slidesEl) return;

  const indices = deck?.getIndices() ?? { h: 0, v: 0, f: undefined };

  injectExtraCss(data);
  applyCanvasVariables(data);
  // 版面辅助线开关（设置项 showGridGuides），CSS 见 grid.scss 的 .rfo-guides
  document.body.classList.toggle('rfo-guides', data.config.showGridGuides === true);
  slidesEl.innerHTML = buildSectionsHtml(data);

  const config = buildRevealConfig(data);
  // 侧边栏窄宽度下防止误切滚动视图（scrollActivationWidth 缺省置 null）
  applyScrollViewGuard(config);

  if (!deck) {
    deck = new Reveal({
      ...config,
      // MathJax 公式说明：
      // - reveal.js 6.x 的 math 插件默认实现为 MathJax2，从 CDN(jsdelivr) 加载，
      //   离线环境下加载失败仅静默降级（不打包整个 MathJax，体积太大）；
      // - 实际使用中 $...$ 公式已由 Obsidian MarkdownRenderer 预渲染为 MathJax HTML，
      //   此插件仅作双保险兜底，不额外传 math 配置。
      plugins: [RevealNotes, RevealHighlight, RevealMath, RevealZoom],
    });
    await deck.initialize();
  } else {
    deck.configure(config);
    deck.sync();
    deck.slide(indices.h, indices.v ?? 0);
  }

  // reveal.js 初始化/同步会改 DOM，长代码自适应须在其后执行
  fitCodeBlocks(document);

  // Mermaid / Chart.js 客户端渲染（占位元素由插件侧处理器生成）
  await hydrateMermaid();
  hydrateCharts();
}

function scheduleRender(): void {
  if (renderTimer !== null) window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderTimer = null;
    void render().catch((err) => {
      console.error('[reveal-for-obsidian] render failed', err);
      showError(`render failed: ${String(err)}`);
    });
  }, 50);
}

function connectEvents(): void {
  const source = new EventSource('/events');
  source.onmessage = (event: MessageEvent<string>) => {
    let message: { type?: string; page?: number } = {};
    try {
      message = JSON.parse(event.data) as typeof message;
    } catch {
      // 老格式或空消息：按整体刷新处理
    }
    if (message.type === 'goto' && typeof message.page === 'number') {
      gotoPage(message.page);
      return;
    }
    scheduleRender();
  };
  source.onerror = () => {
    // SSE 断线自动重连由浏览器处理
  };
}

if (window.__RFO_INLINE__) {
  // 内联模式：先挂上监听，deck 到了再渲染（此时还没有内容可画）
  connectHost();
} else {
  void render()
    .then(() => {
      // 独立导出页（__DECK__ 注入）无需 SSE 实时刷新
      if (!window.__DECK__) connectEvents();
    })
    .catch((err) => {
      console.error('[reveal-for-obsidian] init failed', err);
      showError(`init failed: ${String(err)}`);
    });
}
