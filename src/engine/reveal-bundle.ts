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
  positionToPageIndex,
} from './templateEngine';
import { computeCanvasSize, computeRootFontSize } from './canvasCalculator';
import { applyScrollViewGuard } from './scrollViewHandler';
import { applyHistoryGuard } from './historyGuard';
import { installTapNavigation } from './tapNavigation';
import { PinchZoom } from './pinchZoom';
import { fitCodeBlocks, highlightCodeBlocks } from '../processors/codeBlockProcessor';
import { renderMath } from './mathRenderer';

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
/** 双指缩放的状态机（只在首次初始化时创建，重渲染不重建） */
let pinch: PinchZoom | null = null;
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

/** 渲染成功后清掉错误浮层：否则一条早已修好的报错会一直挂在屏幕上误导人 */
function clearError(): void {
  document.getElementById('rfo-error')?.remove();
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
  overlay.textContent = `[reveal-slide-for-obsidian] ${explain(message)}`;
}

window.addEventListener('error', (event) => showError(event.message));
window.addEventListener('unhandledrejection', (event) => showError(String(event.reason)));

// Mermaid 全局初始化一次；插件侧把 ```mermaid 转成 <div class="rfo-mermaid"> 占位，
// 每次 render 后用 mermaid.run 渲染为 SVG
mermaid.initialize({ startOnLoad: false, theme: 'default' });

/**
 * highlight 插件的实例（模块级单例，`RevealHighlight()` 每次返回同一个对象）。
 * 直接取而不走 deck.getPlugin('highlight')：highlightBlock 只用到插件内部打包的 hljs，
 * 跟 Reveal 实例无关，少一层依赖也就少一处能返回 undefined 的地方。
 * 类型声明里的插件契约只有 id / init，highlightBlock 是它额外挂的方法，按结构补上。
 */
const highlightPlugin = RevealHighlight() as unknown as {
  highlightBlock: (block: HTMLElement) => void;
};

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

/**
 * 宿主的「重置缩放」按钮。
 * 单独挂一条，不跟 connectHost 合并：服务器模式（桌面端）走的是 SSE，不调 connectHost，
 * 但菜单栏的这个按钮两种模式下都该管用。
 */
function listenForZoomReset(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string } | null;
    if (data?.type === 'zoom-reset') pinch?.reset();
  });
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

/** 当前存活的 Chart 实例 */
const charts: Chart[] = [];

/** 插件侧 chartProcessor 生成的 <canvas class="rfo-chart" data-chart="..."> → Chart.js 实例 */
function hydrateCharts(): void {
  // 每次 render 都会 innerHTML 整体重建，canvas 是新节点，但旧实例不会自己走：
  // 它们还挂着 resize 监听、attach 在已脱离文档的 canvas 上。编辑时每次防抖刷新
  // 都攒一批，必须显式销毁。
  while (charts.length > 0) charts.pop()?.destroy();

  document.querySelectorAll<HTMLCanvasElement>('canvas.rfo-chart').forEach((canvas) => {
    const raw = canvas.getAttribute('data-chart');
    if (!raw) return;
    try {
      charts.push(new Chart(canvas, JSON.parse(raw)));
    } catch (err) {
      console.error('[reveal-slide-for-obsidian] chart render failed', err);
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
    console.error('[reveal-slide-for-obsidian] mermaid render failed', err);
  }
}

/**
 * 插件侧 htmlEmbedProcessor 生成的 <div class="rfo-html" data-src> → <iframe>。
 *
 * 为什么不在插件侧直接产出 <iframe>：管线用 DOMParser 造的文档是惰性的，
 * 而这里挂上去的 iframe 才真的会加载、脚本才真的会跑 —— 交互演示的意义就在这里。
 * 嵌入页与预览同源，权限由外层预览 iframe 的 sandbox 一并框住。
 */
function hydrateHtmlEmbeds(): void {
  document.querySelectorAll<HTMLElement>('.rfo-html[data-src]').forEach((box) => {
    const src = box.getAttribute('data-src');
    if (!src) return;
    const frame = document.createElement('iframe');
    frame.setAttribute('src', src);
    // 每次 render 都 innerHTML 整体重建，占位是新节点，直接填即可（旧 iframe 随之作废）
    box.replaceChildren(frame);
  });
}

/**
 * 大于 0 时不把翻页回推给宿主：这一跳是我们自己发起的
 * （宿主的 goto、重渲染后恢复位置），回推会把编辑器光标拽到页首。
 */
let muted = 0;

/** 跳页且不回推宿主 */
function slideMuted(h: number, v: number): void {
  if (!deck) return;
  muted++;
  try {
    deck.slide(h, v);
  } finally {
    // slidechanged 是同步派发的，走到这里时回调已经跑完；
    // 延一拍再归零只是给 reveal 可能的异步路径兜底
    window.setTimeout(() => {
      muted--;
    }, 0);
  }
}

/** 跳到指定页（编辑器光标跟随）；已在该页则不动，避免打断翻页动画 */
function gotoPage(pageIndex: number): void {
  if (!deck || !current) return;
  const target = pageIndexToPosition(current, pageIndex);
  const now = deck.getIndices();
  if (now.h === target.h && (now.v ?? 0) === target.v) return;
  slideMuted(target.h, target.v);
}

/**
 * 翻页 → 通知宿主，让编辑器光标移到这一页的源码起始行（光标跟随的反向）。
 * 独立导出的单文件 HTML、以及 ?print-pdf 打印视图都是顶层窗口，没有宿主可通知。
 */
function notifyHostPage(): void {
  if (muted > 0 || !deck || !current) return;
  if (window.__DECK__ || window.parent === window) return;

  const now = deck.getIndices();
  const page = positionToPageIndex(current, now.h, now.v ?? 0);
  if (page < 0) return;
  window.parent.postMessage({ type: 'rfo-slide', page }, '*');
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
  // blob: 页（移动端内联预览）改不了会话 URL，reveal 写 hash 会抛 SecurityError
  applyHistoryGuard(config, location.protocol);

  if (!deck) {
    const instance = new Reveal({
      ...config,
      // MathJax 公式说明：
      // - reveal.js 6.x 的 math 插件默认实现为 MathJax2，从 CDN(jsdelivr) 加载，
      //   离线环境下加载失败仅静默降级（不打包整个 MathJax，体积太大）；
      // - 实际使用中 $...$ 公式已由 Obsidian MarkdownRenderer 预渲染为 MathJax HTML，
      //   此插件仅作双保险兜底，不额外传 math 配置。
      plugins: [RevealNotes, RevealHighlight, RevealMath, RevealZoom],
    });
    deck = instance;
    await instance.initialize();
    // 首次的 fitCodeBlocks 量不到还没进入视距的垂直子页：reveal 给它们的是
    // display:none，宽高全是 0，而 0 <= 0 会被判成「装得下」直接跳过 —— 于是这些页
    // 的长代码永远不缩（横向页只是 opacity:0，仍有布局，首次就能量准）。
    // 换页时补测刚显示出来的这页。监听挂在 Reveal 实例上，重渲染只换 DOM，无需重复注册。
    instance.on('slidechanged', () => {
      fitCodeBlocks(instance.getCurrentSlide());
      notifyHostPage();
    });
    // 双指缩放挂在 .reveal 外层（.reveal .slides 的 transform 是 reveal 自己的画布缩放）
    pinch = new PinchZoom(
      document.querySelector('.reveal') as HTMLElement,
      () => ({ width: window.innerWidth, height: window.innerHeight }),
      // 手势中/放大后关掉 reveal 的 touch：两指捏合会被它当成「进总览」，
      // 单指拖动会被当成翻页滑动，而这时那正是平移
      (locked) => instance.configure({ touch: !locked }),
    );
    pinch.install(document);

    // 手机上轻点：左三分之一回上页、右三分之一下一页、中间呼出宿主的菜单栏
    installTapNavigation(
      document,
      {
        next: () => instance.next(),
        prev: () => instance.prev(),
        menu: () => window.parent?.postMessage({ type: 'rfo-menu' }, '*'),
      },
      {
        viewportWidth: () => window.innerWidth,
        navigationSuspended: () => pinch?.zoomed === true,
      },
    );
  } else {
    deck.configure(config);
    deck.sync();
    // 恢复位置属于「我们自己跳的」：编辑时每次防抖重渲染都会走到这里，
    // 页数变化导致 reveal 夹取坐标时会触发 slidechanged，不能让它去动光标
    slideMuted(indices.h, indices.v ?? 0);
  }

  // 重渲染出来的代码块 reveal 不会再高亮（插件只在 initialize 时跑一遍），自己补
  highlightCodeBlocks(document, (block) => highlightPlugin.highlightBlock(block));

  // 公式排版：占位符由插件侧 mathProcessor 生成，排完才有确定尺寸，故排在自适应之前
  renderMath(document);

  // reveal.js 初始化/同步会改 DOM，长代码自适应须在其后执行；
  // 高亮同样排在自适应之前 —— 带 data-line-numbers 的块会被 hljs 换成 <table>，尺寸随之变
  fitCodeBlocks(document);

  // Mermaid / Chart.js / 网页嵌入的客户端渲染（占位元素由插件侧处理器生成）
  await hydrateMermaid();
  hydrateCharts();
  hydrateHtmlEmbeds();

  clearError();
}

function scheduleRender(): void {
  if (renderTimer !== null) window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderTimer = null;
    void render().catch((err) => {
      console.error('[reveal-slide-for-obsidian] render failed', err);
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

listenForZoomReset();

if (window.__RFO_INLINE__) {
  // 内联模式：先挂上监听，deck 到了再渲染（此时还没有内容可画）
  connectHost();
} else {
  // 独立导出页（__DECK__ 注入）无需 SSE 实时刷新。
  // 先连再渲染：SSE 曾挂在首渲染的 then 上，于是首次 /deck 一旦失败就再也连不上，
  // 之后宿主推什么都收不到 —— 连「刷新预览」都救不回来，只能关掉面板重开。
  if (!window.__DECK__) connectEvents();
  void render().catch((err) => {
    console.error('[reveal-slide-for-obsidian] init failed', err);
    showError(`init failed: ${String(err)}`);
  });
}
