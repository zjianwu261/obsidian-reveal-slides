/**
 * 版面大纲 → 带坐标的 PPTX 形状（纯计算，不依赖 obsidian / fs，可单测）。
 *
 * 浏览器里块级元素的高度是排完版才知道的，而 PPTX 要求每个形状预先写死坐标，
 * 所以这里只能估算：按字号 + 每字宽度估行数，竖向依次堆叠，超出区域再整体压缩。
 * 估得不准也不会出错 —— PowerPoint 的文本框默认不裁剪，最多是行距略松/略紧。
 */
import type { Align, Box, OutlineBlock, OutlinePara, OutlineRegion, TableCell } from './slideOutline';

/** 画布像素坐标 */
export interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PptxShape =
  | {
      kind: 'text';
      box: PxBox;
      paragraphs: OutlinePara[];
      fill?: string;
      mono?: boolean;
      anchor: 'ctr' | 't';
      /**
       * 溢出压缩系数（0~1）。区域装不下时框被压小了，字号得跟着缩同样的比例，
       * 否则文字照原大小画出去，直接压到下一个块身上。
       */
      fontScale?: number;
    }
  | { kind: 'image'; box: PxBox; src: string; alt: string }
  | { kind: 'table'; box: PxBox; rows: TableCell[][]; size: number; fontScale?: number }
  /** 只有底色/形状的区域背景（<grid> 的 background / shape） */
  | { kind: 'shape'; box: PxBox; fill?: string; geometry: string };

export interface LayoutOptions {
  canvas: { width: number; height: number };
  rootFontSize: number;
  /** 图片原始像素尺寸；返回 null = 该图不可用，排版时跳过 */
  imageSize: (src: string) => { width: number; height: number } | null;
}

/** 正文行高（canvas.scss 里 .reveal 是 1.4，标题 1.2，取中间值够用） */
const LINE_HEIGHT = 1.35;
/** 段间距（相对字号） */
const PARA_GAP = 0.35;
/** 块之间的间距（相对根字号） */
const BLOCK_GAP = 0.4;
/** 表格行高（相对单元格字号） */
const ROW_HEIGHT = 1.9;
/** 列表每层缩进（相对字号） */
const INDENT_EM = 1.2;

/** 估算一段文本占的「字符宽度」，单位 em：CJK 记 1，其余记 0.5 */
function textWidthEm(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code >= 0x2e80 && code <= 0xfaff ? 1 : 0.5;
  }
  return width;
}

/** 估算段落在给定宽度下的行数（\n 是硬换行） */
function estimateLines(para: OutlinePara, widthPx: number, rootFontSize: number): number {
  const indent = para.indent >= 0 ? (para.indent + 1) * INDENT_EM * para.size * rootFontSize : 0;
  const usable = Math.max(widthPx - indent - (para.quoted ? para.size * rootFontSize : 0), 1);

  let lines = 0;
  let current = 0;
  const flushLine = (): void => {
    lines += Math.max(1, Math.ceil(current));
    current = 0;
  };

  for (const run of para.runs) {
    const perLine = Math.max(usable / (run.size * rootFontSize), 1);
    for (const [i, segment] of run.text.split('\n').entries()) {
      if (i > 0) flushLine();
      current += textWidthEm(segment) / perLine;
    }
  }
  flushLine();
  return lines;
}

function paraHeight(para: OutlinePara, widthPx: number, rootFontSize: number): number {
  const font = para.size * rootFontSize;
  const before = (para.spaceBefore ?? 0) * font;
  return estimateLines(para, widthPx, rootFontSize) * font * LINE_HEIGHT + font * PARA_GAP + before;
}

/** 块的估算高度（图片按原始比例撑满区域宽度，但不超过区域高度的 90%） */
function blockHeight(block: OutlineBlock, region: PxBox, opts: LayoutOptions): number {
  const { rootFontSize } = opts;
  switch (block.kind) {
    case 'text': {
      const padding = block.fill ? rootFontSize * 0.5 : 0;
      return (
        block.paragraphs.reduce((sum, para) => sum + paraHeight(para, region.w - padding * 2, rootFontSize), 0) +
        padding * 2
      );
    }
    case 'image':
      return imageSize(block, region, opts).h;
    case 'table':
      return block.rows.length * block.size * rootFontSize * ROW_HEIGHT;
    case 'note':
      return rootFontSize * 1.6;
  }
}

/** 图片在区域内的显示尺寸：显式 width/height 优先，其余按原始比例适配区域 */
function imageSize(
  block: Extract<OutlineBlock, { kind: 'image' }>,
  region: PxBox,
  opts: LayoutOptions,
): { w: number; h: number } {
  const natural = opts.imageSize(block.src);
  const ratio = natural && natural.width > 0 ? natural.height / natural.width : 0.618;

  let w = block.width ?? natural?.width ?? region.w;
  let h = block.height ?? w * ratio;
  if (block.width && !block.height) h = block.width * ratio;
  if (block.height && !block.width) w = block.height / (ratio || 1);

  // 不能超出区域：等比缩到框内（区域高度留一点余量给同页的其他块）
  const maxH = region.h;
  const scale = Math.min(1, region.w / w, maxH / h);
  return { w: w * scale, h: h * scale };
}

function toPx(box: Box, canvas: { width: number; height: number }): PxBox {
  return {
    x: box.x * canvas.width,
    y: box.y * canvas.height,
    w: box.w * canvas.width,
    h: box.h * canvas.height,
  };
}

/** 块的水平对齐取自其首段（图片/表格默认居中，与 .grid 的 align-items: center 一致） */
function blockAlign(block: OutlineBlock): Align {
  if (block.kind === 'text') return block.paragraphs[0]?.align ?? 'l';
  return 'ctr';
}

/** 单个区域 → 形状列表 */
function layoutRegion(region: OutlineRegion, opts: LayoutOptions): PptxShape[] {
  const box = toPx(region.box, opts.canvas);
  const shapes: PptxShape[] = [];

  // 底色 / 形状：先铺在最底下
  if (region.fill || region.geometry) {
    shapes.push({ kind: 'shape', box, fill: region.fill, geometry: region.geometry ?? 'rect' });
  }
  if (region.blocks.length === 0) return shapes;

  const gap = opts.rootFontSize * BLOCK_GAP;
  const heights = region.blocks.map((block) => blockHeight(block, box, opts));
  const total = heights.reduce((sum, h) => sum + h, 0) + gap * (region.blocks.length - 1);

  // 溢出时整体压缩：框与字号缩同一个系数，形状之间才不会互相压住
  const squeeze = total > box.h && total > 0 ? box.h / total : 1;
  const scale = squeeze < 1 ? squeeze : undefined;
  const stackHeight = total * squeeze;
  let y = box.y + (region.center ? Math.max((box.h - stackHeight) / 2, 0) : 0);

  region.blocks.forEach((block, i) => {
    const h = heights[i] * squeeze;
    switch (block.kind) {
      case 'text':
        shapes.push({
          kind: 'text',
          box: { x: box.x, y, w: box.w, h },
          paragraphs: block.paragraphs,
          fill: block.fill,
          mono: block.mono,
          anchor: 't',
          fontScale: scale,
        });
        break;
      case 'image': {
        const size = imageSize(block, { ...box, h }, opts);
        const align = blockAlign(block);
        const x = align === 'l' ? box.x : align === 'r' ? box.x + box.w - size.w : box.x + (box.w - size.w) / 2;
        shapes.push({ kind: 'image', box: { x, y, w: size.w, h: size.h }, src: block.src, alt: block.alt });
        break;
      }
      case 'table':
        // 行高 <a:tr h> 只是下限，行只会长不会缩，所以单元格字号必须跟着缩，
        // 否则压缩过的表格会长出框外压到下一个块
        shapes.push({
          kind: 'table',
          box: { x: box.x, y, w: box.w, h },
          rows: block.rows,
          size: block.size,
          fontScale: scale,
        });
        break;
      case 'note':
        shapes.push({
          kind: 'text',
          box: { x: box.x, y, w: box.w, h },
          paragraphs: [
            {
              runs: [{ text: block.label, size: 0.5, italic: true, color: '9A9A9A' }],
              size: 0.5,
              indent: -1,
              ordered: false,
              align: 'ctr',
            },
          ],
          anchor: 'ctr',
          fontScale: scale,
        });
        break;
    }
    y += h + gap * squeeze;
  });

  return shapes;
}

export function layoutRegions(regions: OutlineRegion[], opts: LayoutOptions): PptxShape[] {
  return regions.flatMap((region) => layoutRegion(region, opts));
}
