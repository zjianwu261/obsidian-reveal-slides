/**
 * 单页 HTML → PPTX 版面大纲（纯 DOM 操作，不依赖 obsidian / fs，可单测）。
 *
 * PPTX 里没有「HTML + CSS」这回事：一页幻灯片是一堆各自带绝对坐标的形状。
 * 所以导出 pptx 必须把渲染后的 HTML 重新理解成「区域 + 区域内的块」：
 *   - <grid> 是天然的区域，它的 width/height/left/top 本来就是画布百分比，直接换算成坐标；
 *   - 其余内容落进一个默认区域（画布减去 margin 的安全区）。
 * 区域内的块（段落 / 图片 / 表格）再由 layoutRegion 竖向排布成带坐标的形状。
 *
 * 字号一律记成「相对根字号的倍率」，取值对齐 canvas.scss 里那套中性默认排版
 * （h1 2em、h2 1.6em、pre 0.55em……），元素上写死的 inline font-size 会逐层相乘。
 */
import { SHAPE_CLIP_PATHS } from '../transformers/shape';

/** 画布比例坐标（0~1），x/y 为左上角 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  /** 等宽字体（行内 code / 代码块） */
  mono?: boolean;
  link?: string;
  /** 'RRGGBB' */
  color?: string;
  /** 相对根字号的倍率 */
  size: number;
}

export type Align = 'l' | 'ctr' | 'r';

export interface OutlinePara {
  runs: TextRun[];
  /** 相对根字号的倍率（段落基准字号） */
  size: number;
  /** 列表层级（0 起）；-1 = 非列表 */
  indent: number;
  ordered: boolean;
  align: Align | null;
  /** 引用块 / callout：左侧留白 + 灰字 */
  quoted?: boolean;
  bold?: boolean;
  color?: string;
  /** 段前额外留白的倍率（标题与正文之间） */
  spaceBefore?: number;
}

export interface TableCell {
  runs: TextRun[];
  header: boolean;
  align: Align | null;
}

export type OutlineBlock =
  | { kind: 'text'; paragraphs: OutlinePara[]; fill?: string; mono?: boolean }
  | { kind: 'image'; src: string; alt: string; width: number | null; height: number | null }
  | { kind: 'table'; rows: TableCell[][]; size: number }
  /** 无法转成 PPTX 原生对象的块（mermaid / chart / 视频），留个说明框 */
  | { kind: 'note'; label: string };

export interface OutlineRegion {
  box: Box;
  blocks: OutlineBlock[];
  /** 区域底色（'RRGGBB'） */
  fill?: string;
  /** PPTX 预设几何图形名（<grid shape="..."> 转过来），默认 'rect' */
  geometry?: string;
  /** 内容竖向居中（<grid> 恒为 true，普通页跟随 center 设置） */
  center: boolean;
}

export interface ParseOptions {
  /**
   * 绝对定位的坐标系 —— 一般就是整块画布 {0,0,1,1}。
   * <grid> 的百分比是相对**整块画布**算的，不能拿安全区当基准，
   * 否则每个 grid 都会被安全区的边距二次缩放，整页版面跟预览对不上。
   */
  canvas: Box;
  /** 普通流式内容（不带 <grid> 的部分）的安全区 */
  content: Box;
  /** 普通页内容是否竖向居中 */
  center: boolean;
  /** 无法转换的块是否留占位说明框 */
  placeholders: boolean;
  /** 画布根字号（px）：绝对字号靠它换算成相对倍率，须与排版用的是同一个值 */
  rootFontSize?: number;
  /** 取样式的方式，默认只认 style 属性；导出时传 computedStyleOf */
  styleOf?: StyleResolver;
}

/** canvas.scss 里的标题字号（相对根字号） */
const HEADING_EM: Record<string, number> = {
  H1: 2,
  H2: 1.6,
  H3: 1.25,
  H4: 1,
  H5: 1,
  H6: 1,
};

const CODE_BLOCK_EM = 0.55;
const TABLE_EM = 0.7;
const CALLOUT_EM = 0.7;
const LINK_COLOR = '2563EB';
const QUOTE_COLOR = '4A4A4A';
const CODE_BG = '2D2D2D';
const CODE_FG = 'F8F8F2';

/** clip-path 值 → PPTX 预设几何图形（<grid shape="..."> 的反查表） */
const SHAPE_TO_PRESET: Record<string, string> = {
  circle: 'ellipse',
  ellipse: 'ellipse',
  triangle: 'triangle',
  'triangle-down': 'flowChartExtract',
  diamond: 'diamond',
  hexagon: 'hexagon',
  pentagon: 'pentagon',
  star: 'star5',
  arrow: 'rightArrow',
  chevron: 'chevron',
  parallelogram: 'parallelogram',
  ribbon: 'ribbon2',
};

/** 最常见的 CSS 具名颜色（够用即可，认不出的颜色一律放弃而不是猜） */
const NAMED_COLORS: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF',
  yellow: 'FFFF00', orange: 'FFA500', purple: '800080', gray: '808080', grey: '808080',
  silver: 'C0C0C0', navy: '000080', teal: '008080', olive: '808000', maroon: '800000',
  lime: '00FF00', aqua: '00FFFF', cyan: '00FFFF', fuchsia: 'FF00FF', magenta: 'FF00FF',
  pink: 'FFC0CB', brown: 'A52A2A', gold: 'FFD700', transparent: '',
};

/** 行内 style → 声明表（键一律小写） */
function inlineStyleOf(el: Element): Record<string, string> {
  const raw = el.getAttribute('style');
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    map[part.slice(0, colon).trim().toLowerCase()] = part.slice(colon + 1).trim();
  }
  return map;
}

export type StyleResolver = (el: Element) => Record<string, string>;

/**
 * 本次解析取样式的方式。默认只认 style 属性 —— 纯字符串解析，可单测；
 * 导出时换成 computedStyleOf，才认得样式表里的 class 规则。
 * parseSlideHtml / parseSlideElement 同步跑完就还原，不会串场。
 */
let resolveStyle: StyleResolver = inlineStyleOf;

function styleOf(el: Element): Record<string, string> {
  return resolveStyle(el);
}

/** 外观类属性交给浏览器算层叠；几何仍读 style 属性 */
const COMPUTED_KEYS = ['color', 'font-size', 'font-weight', 'text-align', 'background-color'];

/** rgba(...,0) / transparent：算出来是「没有颜色」，不能当成黑色底 */
function isTransparent(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed === 'transparent' || /^rgba\([^)]*,\s*0(\.0+)?\s*\)$/.test(trimmed);
}

/**
 * 元素的最终样式：外观取 computed（这样 `.cover { background: var(--brand) }`
 * 这类写在样式表里的规则才算得出来），几何仍取 style 属性。
 *
 * 几何不能用 computed：它会把 `left: 12%` 解析成 px，而 gridBox 要的正是
 * <grid> 写下的百分比——那是相对画布算的，换成 px 就对不上了。
 */
export function computedStyleOf(el: Element): Record<string, string> {
  const inline = inlineStyleOf(el);
  const view = el.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return inline;

  const computed = view.getComputedStyle(el);
  const merged = { ...inline };
  for (const key of COMPUTED_KEYS) {
    const value = computed.getPropertyValue(key);
    if (!value || isTransparent(value)) continue;
    merged[key] = value;
  }
  return merged;
}

/**
 * CSS 长度 → 相对父容器的比例。
 * 认百分比与 `calc(100% - N%)`（gridParser 对负数位置生成的正是后者）。
 */
export function cssFraction(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();

  const calc = /^calc\(\s*([\d.]+)%\s*-\s*([\d.]+)%\s*\)$/.exec(trimmed);
  if (calc) return (Number(calc[1]) - Number(calc[2])) / 100;

  const percent = /^(-?[\d.]+)%$/.exec(trimmed);
  if (percent) return Number(percent[1]) / 100;

  if (/^-?0(?:\.0+)?(?:px)?$/.test(trimmed)) return 0;
  return null;
}

/** `translate(-50%, -50%)` → [-0.5, -0.5]（非百分比的分量按 0 处理） */
function translateFractions(value: string | undefined): [number, number] {
  const match = value ? /translate\(\s*([^,)]+)(?:,\s*([^)]+))?\)/.exec(value) : null;
  if (!match) return [0, 0];
  return [cssFraction(match[1]) ?? 0, cssFraction(match[2]) ?? 0];
}

/** CSS 字号 → 相对当前字号的倍率；px 需要根字号才能换算，故单独传入 */
function fontScale(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^([\d.]+)(em|rem|%|px)$/.exec(value.trim());
  if (!match) return null;
  const num = Number(match[1]);
  switch (match[2]) {
    case 'em':
      return num;
    case '%':
      return num / 100;
    // rem / px 是绝对值，返回时会被调用方当成「替换」而非「相乘」
    default:
      return null;
  }
}

/** CSS 字号里的绝对值（rem / px）→ 相对根字号的倍率；不是绝对值返回 null */
function absoluteFontEm(value: string | undefined, rootFontSize: number): number | null {
  if (!value) return null;
  const match = /^([\d.]+)(rem|px)$/.exec(value.trim());
  if (!match) return null;
  const num = Number(match[1]);
  return match[2] === 'rem' ? num : num / rootFontSize;
}

/** CSS 颜色 → 'RRGGBB'；认不出（渐变、currentColor 等）返回 null */
export function cssColor(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(trimmed);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      return digits.slice(0, 3).split('').map((c) => c + c).join('').toUpperCase();
    }
    if (digits.length === 6 || digits.length === 8) return digits.slice(0, 6).toUpperCase();
    return null;
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(trimmed);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.min(255, Math.max(0, Math.round(Number(n)))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }

  // `background: #fff url(...) no-repeat` 这类简写取第一个能认出的 token
  if (trimmed.includes(' ')) {
    for (const token of trimmed.split(/\s+/)) {
      const color = cssColor(token);
      if (color) return color;
    }
    return null;
  }

  const named = NAMED_COLORS[trimmed];
  return named ? named : null;
}

function cssAlign(value: string | undefined): Align | null {
  switch (value?.trim().toLowerCase()) {
    case 'center':
      return 'ctr';
    case 'right':
    case 'end':
      return 'r';
    case 'left':
    case 'start':
      return 'l';
    default:
      return null;
  }
}

function isGrid(el: Element): boolean {
  return el.classList.contains('grid') && styleOf(el).position === 'absolute';
}

/** 父区域 + <grid> 的定位 CSS → 绝对坐标 */
export function gridBox(parent: Box, style: Record<string, string>): Box {
  const w = parent.w * (cssFraction(style.width) ?? 1);
  const h = parent.h * (cssFraction(style.height) ?? 1);
  const [tx, ty] = translateFractions(style.transform);
  return {
    x: parent.x + parent.w * (cssFraction(style.left) ?? 0) + w * tx,
    y: parent.y + parent.h * (cssFraction(style.top) ?? 0) + h * ty,
    w,
    h,
  };
}

/** 行内样式上下文，沿 DOM 向下继承 */
interface RunStyle {
  size: number;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  mono?: boolean;
  link?: string;
  color?: string;
}

interface Ctx {
  /** 当前字号相对根字号的倍率 */
  size: number;
  align: Align | null;
  color?: string;
  bold?: boolean;
  rootFontSize: number;
  placeholders: boolean;
}

/** 元素自身的行内 CSS 对上下文的影响（字号相乘、颜色/对齐覆盖） */
function applyInlineStyle(ctx: Ctx, style: Record<string, string>): Ctx {
  const absolute = absoluteFontEm(style['font-size'], ctx.rootFontSize);
  const relative = fontScale(style['font-size']);
  const size = absolute ?? (relative !== null ? ctx.size * relative : ctx.size);
  const weight = style['font-weight'];
  return {
    ...ctx,
    size,
    align: cssAlign(style['text-align']) ?? ctx.align,
    color: cssColor(style.color) ?? ctx.color,
    bold: weight ? weight === 'bold' || Number(weight) >= 600 : ctx.bold,
  };
}

const INLINE_BOLD = new Set(['STRONG', 'B', 'TH']);
const INLINE_ITALIC = new Set(['EM', 'I']);
const INLINE_STRIKE = new Set(['DEL', 'S', 'STRIKE']);

/** 收集元素内的行内文本为 run 列表（<br> 转成 '\n'，由 builder 拆成软换行） */
function collectRuns(node: Node, style: RunStyle, ctx: Ctx, out: TextRun[], pre = false): void {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    const raw = node.textContent ?? '';
    // HTML 会折叠空白；<pre> 内原样保留
    const text = pre ? raw : raw.replace(/\s+/g, ' ');
    if (text) out.push({ ...style, text });
    return;
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return;

  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  if (tag === 'BR') {
    out.push({ ...style, text: '\n' });
    return;
  }
  // 图标类内容（callout 的 svg 图标）没有文本价值，直接跳过
  if (tag === 'SVG' || tag === 'IMG') return;

  const css = styleOf(el);
  const absolute = absoluteFontEm(css['font-size'], ctx.rootFontSize);
  const relative = fontScale(css['font-size']);
  const next: RunStyle = {
    ...style,
    size: absolute ?? (relative !== null ? style.size * relative : style.size),
    bold: style.bold || INLINE_BOLD.has(tag) || undefined,
    italic: style.italic || INLINE_ITALIC.has(tag) || undefined,
    strike: style.strike || INLINE_STRIKE.has(tag) || undefined,
    underline: style.underline || tag === 'U' || undefined,
    color: cssColor(css.color) ?? style.color,
  };
  if (css['font-weight']) {
    next.bold = css['font-weight'] === 'bold' || Number(css['font-weight']) >= 600;
  }
  if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') {
    next.mono = true;
    // 行内 code 在 canvas.scss 里是 0.85em；代码块由调用方另行设定字号
    if (!pre) next.size = style.size * 0.85;
  }
  if (tag === 'A') {
    const href = el.getAttribute('href');
    if (href && !href.startsWith('#')) next.link = href;
    next.color = next.color ?? LINK_COLOR;
  }

  for (const child of Array.from(el.childNodes)) {
    collectRuns(child, next, ctx, out, pre || tag === 'PRE');
  }
}

/** 去掉首尾空白 run、合并相邻同款 run；全空返回 [] */
function tidyRuns(runs: TextRun[]): TextRun[] {
  const kept = runs.filter((run) => run.text !== '');
  while (kept.length > 0 && kept[0].text.trim() === '' && kept[0].text !== '\n') kept.shift();
  while (kept.length > 0 && kept[kept.length - 1].text.trim() === '') kept.pop();
  if (kept.every((run) => run.text.trim() === '')) return [];
  return kept;
}

function paraFrom(el: Element, ctx: Ctx, extra: Partial<OutlinePara> = {}): OutlinePara | null {
  const runs: TextRun[] = [];
  collectRuns(el, { size: ctx.size, bold: ctx.bold, color: ctx.color }, ctx, runs);
  const tidied = tidyRuns(runs);
  if (tidied.length === 0) return null;
  return {
    runs: tidied,
    size: ctx.size,
    indent: -1,
    ordered: false,
    align: ctx.align,
    color: ctx.color,
    bold: ctx.bold,
    ...extra,
  };
}

/** <ul>/<ol> → 逐条段落（嵌套列表层级 +1） */
function listParas(list: Element, ctx: Ctx, level: number, out: OutlinePara[]): void {
  const ordered = list.tagName.toUpperCase() === 'OL';
  const listCtx = applyInlineStyle(ctx, styleOf(list));

  for (const item of Array.from(list.children)) {
    if (item.tagName.toUpperCase() !== 'LI') continue;
    const itemCtx = applyInlineStyle(listCtx, styleOf(item));

    // 条目自身的文本：跳过嵌套的 ul/ol，它们单独成段
    const runs: TextRun[] = [];
    for (const child of Array.from(item.childNodes)) {
      const tag = (child as Element).tagName?.toUpperCase();
      if (tag === 'UL' || tag === 'OL') continue;
      collectRuns(child, { size: itemCtx.size, bold: itemCtx.bold, color: itemCtx.color }, itemCtx, runs);
    }
    const tidied = tidyRuns(runs);
    if (tidied.length > 0) {
      out.push({
        runs: tidied,
        size: itemCtx.size,
        indent: level,
        ordered,
        align: itemCtx.align,
        color: itemCtx.color,
      });
    }

    for (const nested of Array.from(item.children)) {
      const tag = nested.tagName.toUpperCase();
      if (tag === 'UL' || tag === 'OL') listParas(nested, itemCtx, level + 1, out);
    }
  }
}

/** <table> → 单元格矩阵（表头行取 <th>） */
function tableBlock(table: Element, ctx: Ctx): OutlineBlock | null {
  const rows: TableCell[][] = [];
  const cellCtx = { ...ctx, size: ctx.size * TABLE_EM };

  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells: TableCell[] = [];
    for (const cell of Array.from(tr.children)) {
      const tag = cell.tagName.toUpperCase();
      if (tag !== 'TD' && tag !== 'TH') continue;
      const runs: TextRun[] = [];
      const own = applyInlineStyle(cellCtx, styleOf(cell));
      collectRuns(cell, { size: own.size, bold: tag === 'TH' || own.bold, color: own.color }, own, runs);
      cells.push({
        runs: tidyRuns(runs),
        header: tag === 'TH',
        align: cssAlign(cell.getAttribute('align') ?? undefined) ?? own.align,
      });
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return null;
  return { kind: 'table', rows, size: cellCtx.size };
}

/** 图片元素 → 块（尺寸取 width/height 属性，缺省交给排版按原始比例算） */
function imageBlock(el: Element): OutlineBlock | null {
  const src = el.getAttribute('src');
  if (!src) return null;
  const num = (value: string | null): number | null => {
    const parsed = Number((value ?? '').replace(/px$/i, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return {
    kind: 'image',
    src,
    alt: el.getAttribute('alt') ?? '',
    width: num(el.getAttribute('width')),
    height: num(el.getAttribute('height')),
  };
}

/** Obsidian callout（.callout）→ 标题 + 正文段落，整体缩进并加底色 */
function calloutBlock(el: Element, ctx: Ctx): OutlineBlock | null {
  const inner = { ...ctx, size: ctx.size * CALLOUT_EM };
  const paragraphs: OutlinePara[] = [];

  const title = el.querySelector('.callout-title');
  if (title) {
    const para = paraFrom(title, { ...inner, bold: true }, { quoted: true });
    if (para) paragraphs.push(para);
  }
  const content = el.querySelector('.callout-content') ?? el;
  for (const child of Array.from(content.children)) {
    if (child.classList.contains('callout-title')) continue;
    const para = paraFrom(child, inner, { quoted: true });
    if (para) paragraphs.push(para);
  }

  if (paragraphs.length === 0) return null;
  return { kind: 'text', paragraphs, fill: 'F2F2F2' };
}

/** 图片 / 视频 / 图表这类「自成一块」的元素 → 块；不是这类元素返回 null */
function mediaBlock(el: Element, ctx: Ctx): OutlineBlock | null {
  const tag = el.tagName.toUpperCase();

  if (tag === 'IMG') return imageBlock(el);
  if (tag === 'SVG') {
    // 笔记里直接写的 <svg>：序列化成 data URI，交由导出器栅格化
    const markup = (el as unknown as { outerHTML: string }).outerHTML;
    return {
      kind: 'image',
      src: `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`,
      alt: 'svg',
      width: null,
      height: null,
    };
  }
  if (!ctx.placeholders) return null;

  if (tag === 'VIDEO') {
    const name = (el.getAttribute('src') ?? '').split('/').pop() ?? '';
    let label = name;
    try {
      label = decodeURIComponent(name);
    } catch {
      // 非法编码就用原样文件名，不值得为此丢掉整块提示
    }
    return { kind: 'note', label: `视频（PPTX 未嵌入）：${label}` };
  }
  if (tag === 'CANVAS' && el.classList.contains('rfo-chart')) {
    return { kind: 'note', label: 'Chart.js 图表：需在浏览器渲染，PPTX 未导出' };
  }
  if (el.classList.contains('rfo-mermaid')) {
    return { kind: 'note', label: 'Mermaid 图：需在浏览器渲染，PPTX 未导出' };
  }
  return null;
}

/** 段落里夹带的媒体元素（Obsidian 把 ![[a.png]] 渲染成 <p><img></p>，极常见） */
const MEDIA_SELECTOR = 'img, svg, video, canvas, .rfo-mermaid';

interface BlockCollector {
  blocks: OutlineBlock[];
  pending: OutlinePara[];
}

function flush(collector: BlockCollector): void {
  if (collector.pending.length === 0) return;
  collector.blocks.push({ kind: 'text', paragraphs: collector.pending });
  collector.pending = [];
}

/** 容器内的块级内容 → OutlineBlock 列表（遇到 grid/split 交给调用方另开区域） */
function collectBlocks(
  container: Element,
  ctx: Ctx,
  collector: BlockCollector,
  onRegion: (el: Element, ctx: Ctx) => void,
): void {
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ');
      if (text.trim()) {
        collector.pending.push({
          runs: [{ text, size: ctx.size, color: ctx.color }],
          size: ctx.size,
          indent: -1,
          ordered: false,
          align: ctx.align,
        });
      }
      continue;
    }
    if (node.nodeType !== 1) continue;

    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    const own = applyInlineStyle(ctx, styleOf(el));

    if (isGrid(el)) {
      flush(collector);
      onRegion(el, ctx);
      continue;
    }

    if (HEADING_EM[tag] !== undefined) {
      const headingCtx = { ...own, size: own.size * HEADING_EM[tag], bold: true };
      const para = paraFrom(el, headingCtx, {
        // 标题接在正文后面时留一行间距，免得挤在一起
        spaceBefore: collector.pending.length > 0 ? 0.5 : 0,
      });
      if (para) collector.pending.push(para);
      continue;
    }

    switch (tag) {
      case 'P':
      case 'DT':
      case 'DD': {
        // 图片必须自成一块（PPTX 里没有「文字环绕图片」这回事）。
        // Obsidian 渲染的 ![[a.png]] 就躺在 <p> 里，漏了这一步整张图会凭空消失。
        const media = Array.from(el.querySelectorAll(MEDIA_SELECTOR));
        const para = paraFrom(el, own);
        if (para) collector.pending.push(para);
        if (media.length > 0) {
          flush(collector);
          for (const node of media) {
            const block = mediaBlock(node, own);
            if (block) collector.blocks.push(block);
          }
        }
        break;
      }
      case 'UL':
      case 'OL':
        listParas(el, own, 0, collector.pending);
        break;
      case 'BLOCKQUOTE': {
        const quoteCtx = { ...own, color: own.color ?? QUOTE_COLOR };
        for (const child of Array.from(el.children)) {
          const para = paraFrom(child, quoteCtx, { quoted: true });
          if (para) collector.pending.push(para);
        }
        break;
      }
      case 'PRE': {
        flush(collector);
        const runs: TextRun[] = [];
        const codeSize = own.size * CODE_BLOCK_EM;
        collectRuns(el, { size: codeSize, mono: true, color: CODE_FG }, own, runs, true);
        const text = runs.map((run) => run.text).join('').replace(/\n+$/, '');
        if (text.trim()) {
          const paragraphs = text.split('\n').map((line) => ({
            runs: [{ text: line || ' ', size: codeSize, mono: true, color: CODE_FG }],
            size: codeSize,
            indent: -1,
            ordered: false,
            align: 'l' as Align,
          }));
          collector.blocks.push({ kind: 'text', paragraphs, fill: CODE_BG, mono: true });
        }
        break;
      }
      case 'TABLE': {
        flush(collector);
        const block = tableBlock(el, own);
        if (block) collector.blocks.push(block);
        break;
      }
      case 'IMG':
      case 'SVG':
      case 'VIDEO':
      case 'CANVAS': {
        flush(collector);
        const block = mediaBlock(el, own);
        if (block) collector.blocks.push(block);
        break;
      }
      case 'HR':
      case 'SCRIPT':
      case 'STYLE':
        break;
      default: {
        if (el.classList.contains('rfo-mermaid')) {
          flush(collector);
          const block = mediaBlock(el, own);
          if (block) collector.blocks.push(block);
          break;
        }
        if (el.classList.contains('callout')) {
          flush(collector);
          const block = calloutBlock(el, own);
          if (block) collector.blocks.push(block);
          break;
        }
        if (el.children.length > 0 || tag === 'DIV' || tag === 'SECTION' || tag === 'DL') {
          // 普通包装容器：直接下钻，样式已经并进 own
          collectBlocks(el, own, collector, onRegion);
          break;
        }
        const para = paraFrom(el, own);
        if (para) collector.pending.push(para);
      }
    }
  }
}

/**
 * 渲染后的演讲者备注 HTML → 纯文本行（PPTX 的备注页只收纯文本）。
 * 按块级元素拆行，嵌套块只算最外层那次，免得同一句话出现两遍。
 */
export function notesToLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: string[] = [];

  const push = (text: string): void => {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed) lines.push(trimmed);
  };

  const blocks = doc.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, pre, blockquote');
  if (blocks.length === 0) {
    push(doc.body.textContent ?? '');
    return lines;
  }
  blocks.forEach((el) => {
    // <li> 里的 <p>、<blockquote> 里的 <p> 由外层一并取走；嵌套 <li> 仍要各自成行
    if (el.parentElement?.closest('li, blockquote') && el.tagName !== 'LI') return;
    push(el.textContent ?? '');
  });
  return lines;
}

/** <grid shape="..."> 的 clip-path → PPTX 预设几何图形名 */
function geometryOf(style: Record<string, string>): string | undefined {
  const clip = style['clip-path'];
  if (!clip) return undefined;
  for (const [name, path] of Object.entries(SHAPE_CLIP_PATHS)) {
    if (path === clip.trim()) return SHAPE_TO_PRESET[name];
  }
  return undefined;
}

/**
 * 单页 HTML → 区域列表。
 * 每个 <grid> 一个区域（嵌套 grid 的坐标按父区域逐层复合），
 */
export function parseSlideHtml(html: string, options: ParseOptions): OutlineRegion[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return parseSlideElement(doc.body, options);
}

/**
 * 已经挂在文档里的一页 → 区域列表。
 * 与 parseSlideHtml 的差别只在入口：元素是活的，才有 computed style 可取，
 * 样式表里的 class 规则（`.cover`、`.bar` 这些）也才算得出来。
 */
export function parseSlideElement(root: Element, options: ParseOptions): OutlineRegion[] {
  const previous = resolveStyle;
  resolveStyle = options.styleOf ?? inlineStyleOf;
  try {
    return collectRegions(root, options);
  } finally {
    resolveStyle = previous;
  }
}

function collectRegions(body: Element, options: ParseOptions): OutlineRegion[] {
  // 演讲者备注单独走 notesSlide，正文里不该出现
  body.querySelectorAll('aside.notes').forEach((el) => el.remove());

  const regions: OutlineRegion[] = [];
  const baseCtx: Ctx = {
    size: 1,
    align: null,
    rootFontSize: options.rootFontSize ?? 40,
    placeholders: options.placeholders,
  };

  /**
   * frame   子 <grid> 的定位基准（CSS 里最近的 position: absolute 祖先）
   * content 本容器自身的流式内容占的区域
   * 两者只在页面根部不同：grid 认整块画布，正文认安全区。
   */
  const visit = (
    container: Element,
    frame: Box,
    content: Box,
    ctx: Ctx,
    center: boolean,
    depth: number,
  ): void => {
    if (depth > 8) return; // 与 gridParser 的嵌套上限一致，防病态输入
    const style = styleOf(container);
    const collector: BlockCollector = { blocks: [], pending: [] };
    const region: OutlineRegion = {
      box: content,
      blocks: collector.blocks,
      fill: cssColor(style['background-color']) ?? cssColor(style.background) ?? undefined,
      geometry: geometryOf(style),
      center,
    };
    regions.push(region);

    collectBlocks(container, ctx, collector, (el, childCtx) => {
      const childStyle = styleOf(el);
      const nextCtx = applyInlineStyle(childCtx, childStyle);
      // grid 自身是 position: absolute，于是它同时成为子 grid 的定位基准
      const box = gridBox(frame, childStyle);
      visit(el, box, box, nextCtx, true, depth + 1);
    });

    // region.blocks 与 collector.blocks 是同一个数组，flush 的结果直接落在区域上
    flush(collector);
  };

  visit(body, options.canvas, options.content, baseCtx, options.center, 0);
  return regions.filter((region) => region.blocks.length > 0 || region.fill || region.geometry);
}
