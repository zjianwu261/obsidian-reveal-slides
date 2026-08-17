/**
 * PPTX 导出：把当前 deck 转成可编辑的 PowerPoint 文件（Office / WPS / Keynote 都能直接打开）。
 *
 * 与 PDF / HTML 导出的分工：
 *   PDF   给定稿打印，版面 100% 还原，不可编辑
 *   HTML  给离线放映，动画/图表全在，需要浏览器
 *   PPTX  给「要交给别人接着改」的场合 —— 文字是文本框、图片是图片、表格是表格
 *
 * 只能在桌面端跑（读文件、写文件、栅格化 SVG 都靠 Electron 环境），
 * 顶层 import 了 fs/path，故由 main.ts 动态 import 进来。
 */
import * as fs from 'fs';
import * as path from 'path';
import { FileSystemAdapter, Notice } from 'obsidian';
import type RevealPlugin from '../main';
import type { SlideDeck, SlidePage } from '../types/slide';
import { computeCanvasSize, computeRootFontSize } from '../engine/canvasCalculator';
import { collectVaultAssetRefs } from './assetLocalizer';
import { urlPathToNative } from '../utils/vaultPath';
import { computedStyleOf, cssColor, notesToLines, parseSlideElement, parseSlideHtml } from './slideOutline';
import type { OutlineRegion } from './slideOutline';
import { INLINE_ASSETS } from '../assets';
import { layoutRegions } from './pptxLayout';
import { buildPptx } from './pptxBuilder';
import type { PptxMedia, PptxSlideInput } from './pptxBuilder';
import { createZip } from './zipWriter';
import { imageSize as readImageSize, svgSize } from './imageMeta';
import { exportRelativeDir, sanitizeFileName } from './exportPaths';

/** <grid> 的定位基准：整块画布（百分比定位就是相对它写的） */
const CANVAS_BOX = { x: 0, y: 0, w: 1, h: 1 };
/** 普通内容（非 <grid>）的安全区，四周各留一点边距 */
const CONTENT_BOX = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };

/** SVG 栅格化的最长边上限（再大对 PPT 无意义，只会把文件撑爆） */
const RASTER_MAX_EDGE = 2400;

interface LoadedMedia {
  ext: string;
  data: Buffer;
  size: { width: number; height: number } | null;
}

/** 判断背景值是颜色还是图片 —— 与 templateEngine.renderPageSection 的判据保持一致 */
function isImageBackground(value: string): boolean {
  return !(/^(#|rgb|hsl|[a-z]+$)/i.test(value) && !/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(value));
}

/** data: URI → { mime, 字节 }；解析失败返回 null */
function parseDataUri(uri: string): { mime: string; data: Buffer } | null {
  const match = /^data:([^;,]+)((?:;[^,]*)*),([\s\S]*)$/.exec(uri);
  if (!match) return null;
  const [, mime, params, payload] = match;
  try {
    const data = params.includes(';base64')
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return { mime: mime.toLowerCase(), data };
  } catch {
    return null;
  }
}

/** MIME → 扩展名（媒体部件名与 [Content_Types].xml 的 Default 都靠它） */
function extFromMime(mime: string): string {
  const known: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
    'image/svg+xml': 'svg',
  };
  return known[mime] ?? 'png';
}

/**
 * SVG → PNG。PowerPoint 对 SVG 的支持要求同时提供位图兜底，与其赌它的版本，
 * 不如在 Obsidian 这个现成的 Chromium 里直接画一张 PNG（```svg 块全靠这条路进 PPT）。
 * 动画 SVG 取的是第 0 帧 —— PPTX 本来也放不了 CSS 动画。
 */
async function rasterizeSvg(markup: string): Promise<LoadedMedia | null> {
  const intrinsic = svgSize(markup) ?? { width: 1200, height: 900 };
  const scale = Math.min(2, RASTER_MAX_EDGE / Math.max(intrinsic.width, intrinsic.height));
  const width = Math.max(1, Math.round(intrinsic.width * scale));
  const height = Math.max(1, Math.round(intrinsic.height * scale));
  const source = `data:image/svg+xml;base64,${Buffer.from(markup, 'utf8').toString('base64')}`;

  const dataUrl = await new Promise<string | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });

  if (!dataUrl) return null;
  const parsed = parseDataUri(dataUrl);
  return parsed ? { ext: 'png', data: parsed.data, size: { width, height } } : null;
}

/** 一页的样式沙箱：往 section 里塞 HTML，就能从元素上读到算完层叠的样式 */
interface StyleFrame {
  section: HTMLElement;
  dispose(): void;
}

/**
 * 把 deck 的样式表与画布尺寸复刻进一个隐藏 iframe，让浏览器把层叠算完。
 *
 * 不这样做的话，导出只看得见元素的 style 属性 —— `<grid class="cover">` 的位置是
 * 插件写成内联样式的，所以位置对；而蓝底、白字、居中这些写在样式表里的 class 规则
 * 一律丢失，导出的 PPT 只剩黑字堆在原位。
 *
 * 必须是 iframe：课件样式表里满是 `:root {}`、`h1 {}` 这类全局规则，
 * 注进 Obsidian 自己的文档会把整个界面染一遍。
 */
function openStyleFrame(
  deck: SlideDeck,
  canvas: { width: number; height: number },
  rootFontSize: number,
): StyleFrame | null {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    `position:fixed;left:-99999px;top:0;border:0;visibility:hidden;` +
    `width:${canvas.width}px;height:${canvas.height}px;`;
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return null;
  }

  const size = `width:${canvas.width}px;height:${canvas.height}px`;
  // reveal.js 没在跑，.present 之外的页会被 display:none 藏掉，直接放开；
  // 变量挂 :root，与 reveal-bundle.applyCanvasVariables 落点一致
  doc.open();
  doc.write(
    `<!doctype html><html style="--canvas-width:${canvas.width};--canvas-height:${canvas.height};` +
      `--root-font-size:${rootFontSize}px"><head><meta charset="utf-8">` +
      `<style>${INLINE_ASSETS.resetCss}</style>` +
      `<style>${INLINE_ASSETS.revealCss}</style>` +
      `<style>${INLINE_ASSETS.pluginCss}</style>` +
      (deck.cssVariables ? `<style id="reveal-doc-css">${deck.cssVariables}</style>` : '') +
      `<style>html,body{margin:0;padding:0;background:transparent}` +
      `.reveal .slides>section{display:block!important;position:relative;top:auto;left:auto;` +
      `transform:none;${size}}</style></head><body>` +
      `<div class="reveal ready" style="${size}"><div class="slides" style="${size}">` +
      `<section id="rfo-page" class="present"></section></div></div></body></html>`,
  );
  doc.close();

  const section = doc.getElementById('rfo-page');
  if (!section) {
    frame.remove();
    return null;
  }
  return { section, dispose: () => frame.remove() };
}

/** 资源 URL → 本地文件路径；不是 vault 资源（远程图片等）返回 null */
function vaultPathOf(src: string, serverBase: string | undefined): string | null {
  // collectVaultAssetRefs 认 `{serverBase}/vault/...` 与 `app://.../...` 两种形态，
  // 直接把单个 URL 当作待扫描文本喂进去即可
  const ref = collectVaultAssetRefs(src, serverBase)[0];
  return ref ? urlPathToNative(ref.absolutePath) : null;
}

/** 载入一份媒体：本地文件 / data URI（SVG 走栅格化）；远程与缺失返回 null */
async function loadMedia(src: string, serverBase: string | undefined): Promise<LoadedMedia | null> {
  if (src.startsWith('data:')) {
    const parsed = parseDataUri(src);
    if (!parsed) return null;
    if (parsed.mime === 'image/svg+xml') return rasterizeSvg(parsed.data.toString('utf8'));
    const ext = extFromMime(parsed.mime);
    return { ext, data: parsed.data, size: readImageSize(parsed.data, ext) };
  }

  const filePath = vaultPathOf(src, serverBase);
  if (!filePath || !fs.existsSync(filePath)) return null;

  const ext = path.extname(filePath).slice(1).toLowerCase() || 'png';
  const data = fs.readFileSync(filePath);
  // vault 里的 .svg 同样要栅格化，否则 PowerPoint 里是一片空白
  if (ext === 'svg') return rasterizeSvg(data.toString('utf8'));
  return { ext: ext === 'jpg' ? 'jpeg' : ext, data, size: readImageSize(data, ext) };
}

/** 走一遍大纲，收集所有图片 src */
function collectImageSources(regions: OutlineRegion[]): string[] {
  const sources: string[] = [];
  for (const region of regions) {
    for (const block of region.blocks) {
      if (block.kind === 'image') sources.push(block.src);
    }
  }
  return sources;
}

/** 单页的背景：data-background-* 属性 > page.background > deck 全局 bg */
function pageBackground(page: SlidePage, deckBg?: string): { color?: string; image?: string } {
  const attrs = page.attributes ?? {};
  if (attrs['data-background-color']) {
    const color = cssColor(attrs['data-background-color']);
    if (color) return { color };
  }
  if (attrs['data-background-image']) return { image: attrs['data-background-image'] };

  const value = page.background ?? deckBg;
  if (!value) return {};
  if (isImageBackground(value)) return { image: value };
  const color = cssColor(value);
  return color ? { color } : {};
}

export async function exportPptx(plugin: RevealPlugin): Promise<void> {
  const adapter = plugin.app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    new Notice('reveal-slide-for-obsidian: PPTX export requires a filesystem vault');
    return;
  }

  const deck: SlideDeck = plugin.deck;
  const config = deck.config;
  const canvas = computeCanvasSize({
    size: config.size ?? plugin.settings.size,
    width: config.width ?? plugin.settings.width,
    height: config.height ?? plugin.settings.height,
  });
  const rootFontSize = computeRootFontSize(
    canvas,
    plugin.settings.fontScale,
    config.autoFontScale ?? plugin.settings.autoFontScale,
  );
  const serverBase = plugin.serverBase;

  // 1. 逐页解析成区域大纲，同时把要嵌进包里的图片列出来。
  //    样式沙箱建得起来就走 computed style（认样式表里的 class 规则），
  //    建不起来退回只认 style 属性，导出不至于因此失败
  const frame = openStyleFrame(deck, canvas, rootFontSize);
  const parseOptions = {
    canvas: CANVAS_BOX,
    content: CONTENT_BOX,
    center: config.center ?? plugin.settings.center,
    placeholders: plugin.settings.pptxPlaceholders,
    rootFontSize,
  };
  let outlines: OutlineRegion[][];
  try {
    outlines = deck.pages.map((page) => {
      if (!frame) return parseSlideHtml(page.html, parseOptions);
      frame.section.innerHTML = page.html;
      return parseSlideElement(frame.section, { ...parseOptions, styleOf: computedStyleOf });
    });
  } finally {
    frame?.dispose();
  }

  const backgrounds = deck.pages.map((page) => pageBackground(page, deck.bg));
  const wanted = new Set<string>();
  outlines.forEach((regions) => collectImageSources(regions).forEach((src) => wanted.add(src)));
  backgrounds.forEach((bg) => {
    if (bg.image) wanted.add(bg.image);
  });

  // 2. 载入媒体（远程图片一律跳过：导出不该悄悄发起网络请求）
  const media: PptxMedia[] = [];
  const sizes = new Map<string, { width: number; height: number }>();
  let skipped = 0;
  for (const src of wanted) {
    const loaded = await loadMedia(src, serverBase);
    if (!loaded) {
      skipped++;
      continue;
    }
    media.push({ src, ext: loaded.ext, data: loaded.data });
    if (loaded.size) sizes.set(src, loaded.size);
  }
  const embedded = new Set(media.map((item) => item.src));

  // 3. 排版 + 组包
  const slides: PptxSlideInput[] = outlines.map((regions, i) => ({
    shapes: layoutRegions(regions, {
      canvas,
      rootFontSize,
      imageSize: (src) => sizes.get(src) ?? null,
    }).filter((shape) => shape.kind !== 'image' || embedded.has(shape.src)),
    notes: deck.pages[i].notes.flatMap((note) => notesToLines(note.content)),
    backgroundColor: backgrounds[i].color,
    backgroundImage:
      backgrounds[i].image && embedded.has(backgrounds[i].image!) ? backgrounds[i].image : undefined,
  }));

  const title = deck.title || 'slides';
  const zip = createZip(buildPptx({ title, canvas, rootFontSize, slides, media }));

  // 4. 落盘
  const relative = exportRelativeDir(plugin.settings.exportDirectory);
  const exportDir = path.join(adapter.getBasePath(), relative);
  fs.mkdirSync(exportDir, { recursive: true });

  const fileName = `${sanitizeFileName(title)}.pptx`;
  fs.writeFileSync(path.join(exportDir, fileName), zip);

  const target = relative ? `${relative}/${fileName}` : fileName;
  new Notice(
    skipped > 0
      ? `reveal-slide-for-obsidian: exported to ${target}（${skipped} 张图片未能嵌入，多为远程图片）`
      : `reveal-slide-for-obsidian: exported to ${target}`,
  );
}
