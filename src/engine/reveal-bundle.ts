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
import type { SlideDeck } from '../types/slide';
import { buildSectionsHtml, buildRevealConfig, buildExtraCssHtml } from './templateEngine';

let deck: RevealApi | null = null;
let renderTimer: number | null = null;

async function fetchDeck(): Promise<SlideDeck> {
  const res = await fetch('/deck', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch deck: ${res.status}`);
  return res.json() as Promise<SlideDeck>;
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

async function render(): Promise<void> {
  const data = await fetchDeck();
  const slidesEl = document.querySelector<HTMLElement>('.slides');
  if (!slidesEl) return;

  const indices = deck?.getIndices() ?? { h: 0, v: 0, f: undefined };

  injectExtraCss(data);
  slidesEl.innerHTML = buildSectionsHtml(data);

  const config = buildRevealConfig(data);

  if (!deck) {
    deck = new Reveal({
      ...config,
      plugins: [RevealNotes, RevealHighlight, RevealMath, RevealZoom],
    });
    await deck.initialize();
  } else {
    deck.configure(config);
    deck.sync();
    deck.slide(indices.h, indices.v ?? 0);
  }
}

function scheduleRender(): void {
  if (renderTimer !== null) window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderTimer = null;
    void render().catch((err) => console.error('[reveal-for-obsidian] render failed', err));
  }, 50);
}

function connectEvents(): void {
  const source = new EventSource('/events');
  source.onmessage = () => scheduleRender();
  source.onerror = () => {
    // SSE 断线自动重连由浏览器处理
  };
}

void render()
  .then(connectEvents)
  .catch((err) => console.error('[reveal-for-obsidian] init failed', err));
