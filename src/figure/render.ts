/**
 * 声明 → SVG（纯函数，不依赖 obsidian、不碰 DOM）。
 *
 * 为什么由代码算坐标而不是让人（或模型）手写 SVG：框宽、间距、对齐这类事一旦交给手，
 * 同一类图在第 3 页和第 30 页就会长得不一样。声明只描述内容，像素归这里管。
 *
 * 与 skill 里的 figure.py 是同一套布局，两边输出一致 —— 笔记里实时预览用这份，
 * 批量出图 / 脱离 Obsidian 用那份。
 */
import type {
  BitfieldSpec,
  CompareSpec,
  FigureSpec,
  FigureTheme,
  FlowSpec,
  TimelineSpec,
} from './types';
import { mergeTheme } from './theme';

/** viewBox 基准宽度；高度按内容算 */
const BASE_W = 900;
const PAD = 10;

/**
 * 图里的字号是 viewBox 单位，最终多大取决于图被塞进多宽的 grid ——
 * 同一张图放进 92% 宽的格子和 55% 宽的格子，字能差出一倍。
 *
 * textScale 就是用来找齐的：它不改字号，改的是画布宽度（900 / scale）。
 * 画布窄了，同样的字在最终画面里就显得大。想让图里的字跟旁边正文一样大时调它。
 */
function canvasWidth(scale: number | undefined): number {
  const factor = Number.isFinite(scale) && scale ? Math.min(3, Math.max(0.5, scale as number)) : 1;
  return Math.round(BASE_W / factor);
}

/** 中日韩字符按一个字宽算，其余半个 —— 够用来定框宽 */
export function textWidth(text: string, size: number): number {
  let units = 0;
  for (const ch of text) units += ch.codePointAt(0)! > 0x2e80 ? 2 : 1;
  return units * size * 0.5;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 反引号包住的片段切成等宽字体：`a == b` 判断 → <tspan>a == b</tspan> 判断。
 * 作者照 Markdown 习惯敲反引号，直接输出就成了字面上的反引号。
 */
export function rich(text: string, mono: string): string {
  return String(text ?? '')
    .split('`')
    .map((part, i) => {
      if (!part) return '';
      return i % 2 ? `<tspan font-family="${esc(mono)}">${esc(part)}</tspan>` : esc(part);
    })
    .join('');
}

function svgOpen(width: number, height: number, t: FigureTheme): string[] {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="${esc(t.font)}">`,
    '  <defs>',
    '    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" ' +
      `orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${t.arrow}"/></marker>`,
    '    <style>',
    `      .chip{fill:${t.soft};stroke:${t.brand};stroke-width:2;rx:12}`,
    `      .step{fill:#fff;stroke:${t.line};stroke-width:2;rx:12}`,
    `      .op{font:600 30px ${t.mono};fill:${t.brand}}`,
    `      .t{font:22px sans-serif;fill:${t.text}}`,
    `      .m{font:20px ${t.mono};fill:${t.muted}}`,
    `      .lead{font:600 22px sans-serif;fill:${t.accent}}`,
    `      .h{font:600 26px sans-serif;fill:${t.brand}}`,
    `      .arr{stroke:${t.arrow};stroke-width:3;marker-end:url(#a)}`,
    '    </style>',
    '  </defs>',
  ];
}

/** 一行一条流程：主体 chip → 若干环节 → 右侧例子 */
function renderFlow(spec: FlowSpec, t: FigureTheme): string {
  const W = canvasWidth(spec.textScale);
  const rows = spec.rows ?? [];
  const rowH = 124;
  const boxH = 60;
  const height = PAD * 2 + rows.length * rowH - (rowH - boxH - 30);
  const out = svgOpen(W, height, t);

  rows.forEach((row, i) => {
    const y = PAD + 16 + i * rowH;
    if (i) {
      out.push(
        `  <line x1="${PAD}" y1="${y - 32}" x2="${W - PAD}" y2="${y - 32}" ` +
          `stroke="${t.rule}" stroke-width="2"/>`,
      );
    }
    let x = PAD;
    const chip = row.chip ?? '';
    if (chip) {
      const w = Math.max(110, textWidth(chip, 30) + 46);
      out.push(`  <rect class="chip" x="${x}" y="${y}" width="${w.toFixed(0)}" height="${boxH}"/>`);
      out.push(
        `  <text class="op" x="${(x + w / 2).toFixed(0)}" y="${y + 40}" text-anchor="middle">${esc(chip)}</text>`,
      );
      x += w + 12;
    }
    for (const step of row.steps ?? []) {
      out.push(`  <line class="arr" x1="${x}" y1="${y + 30}" x2="${x + 44}" y2="${y + 30}"/>`);
      x += 54;
      const w = Math.max(140, textWidth(String(step), 22) + 44);
      out.push(`  <rect class="step" x="${x}" y="${y}" width="${w.toFixed(0)}" height="${boxH}"/>`);
      out.push(
        `  <text class="t" x="${(x + w / 2).toFixed(0)}" y="${y + 37}" ` +
          `text-anchor="middle">${rich(String(step), t.mono)}</text>`,
      );
      x += w + 12;
    }
    const note = row.note;
    if (note) {
      const nx = Math.min(x + 14, W - PAD - textWidth(String(note), 20));
      const title = row.noteTitle ?? row.note_title;
      if (title) {
        out.push(`  <text class="lead" x="${nx.toFixed(0)}" y="${y + 26}">${esc(title)}</text>`);
        out.push(`  <text class="m" x="${nx.toFixed(0)}" y="${y + 54}">${esc(note)}</text>`);
      } else {
        out.push(`  <text class="m" x="${nx.toFixed(0)}" y="${y + 38}">${esc(note)}</text>`);
      }
    }
  });

  out.push('</svg>');
  return out.join('\n');
}

/** 两三列对照 */
function renderCompare(spec: CompareSpec, t: FigureTheme): string {
  const W = canvasWidth(spec.textScale);
  const cols = spec.columns ?? [];
  const n = Math.max(cols.length, 1);
  const gap = 30;
  const cw = (W - PAD * 2 - gap * (n - 1)) / n;
  const rows = Math.max(...cols.map((c) => (c.lines ?? []).length), 0);
  const height = PAD * 2 + 70 + rows * 40 + 20;
  const out = svgOpen(W, height, t);

  cols.forEach((col, i) => {
    const x = PAD + i * (cw + gap);
    out.push(
      `  <rect class="${col.highlight ? 'chip' : 'step'}" x="${x.toFixed(0)}" y="${PAD}" ` +
        `width="${cw.toFixed(0)}" height="${(height - PAD * 2).toFixed(0)}"/>`,
    );
    out.push(`  <text class="h" x="${(x + 26).toFixed(0)}" y="${PAD + 46}">${esc(col.title)}</text>`);
    (col.lines ?? []).forEach((line, j) => {
      const y = PAD + 92 + j * 40;
      out.push(
        `  <text class="t" x="${(x + 26).toFixed(0)}" y="${y}">${rich(String(line), t.mono)}</text>`,
      );
    });
  });

  out.push('</svg>');
  return out.join('\n');
}

/** 寄存器位分布：高位在前，D 编号自动标 */
function renderBitfield(spec: BitfieldSpec, t: FigureTheme): string {
  const W = canvasWidth(spec.textScale);
  const bits = spec.bits ?? [];
  const n = bits.length;
  const highlight = new Set((spec.highlight ?? []).map(String));
  const caption = spec.caption;
  const height = caption ? 200 : 165;
  const out = svgOpen(W, height, t);

  if (spec.name) {
    out.push(`  <text class="op" x="${PAD}" y="42">${esc(spec.name)}</text>`);
    const meta = [spec.addr, spec.meta].filter(Boolean).join(' · ');
    if (meta) out.push(`  <text class="m" x="${PAD + 120}" y="42">${esc(meta)}</text>`);
  }

  const gap = 5;
  const cw = (W - PAD * 2 - gap * (n - 1)) / Math.max(n, 1);
  bits.forEach((bit, i) => {
    const x = PAD + i * (cw + gap);
    const hot = highlight.has(bit) || highlight.has(String(n - 1 - i));
    out.push(
      `  <rect class="${hot ? 'chip' : 'step'}" x="${x.toFixed(0)}" y="60" ` +
        `width="${cw.toFixed(0)}" height="58"/>`,
    );
    out.push(
      `  <text class="op" x="${(x + cw / 2).toFixed(0)}" y="99" text-anchor="middle" ` +
        `style="font-size:24px">${esc(bit)}</text>`,
    );
    out.push(
      `  <text class="m" x="${(x + cw / 2).toFixed(0)}" y="140" text-anchor="middle" ` +
        `style="font-size:18px;fill:#888">D${n - 1 - i}</text>`,
    );
  });
  if (caption) out.push(`  <text class="lead" x="${PAD}" y="182">${esc(caption)}</text>`);

  out.push('</svg>');
  return out.join('\n');
}

/** 时序 / 阶段推进 */
function renderTimeline(spec: TimelineSpec, t: FigureTheme): string {
  const W = canvasWidth(spec.textScale);
  const nodes = spec.nodes ?? [];
  const height = 200;
  const y = 110;
  const out = svgOpen(W, height, t);
  out.push(`  <line class="arr" x1="30" y1="${y}" x2="${W - 20}" y2="${y}"/>`);

  const span = (W - 140) / Math.max(nodes.length, 1);
  nodes.forEach((node, i) => {
    const x = 100 + i * span;
    out.push(
      `  <line x1="${x.toFixed(0)}" y1="${y - 14}" x2="${x.toFixed(0)}" y2="${y + 14}" ` +
        `stroke="${t.line}" stroke-width="2"/>`,
    );
    out.push(`  <circle cx="${x.toFixed(0)}" cy="${y}" r="7" fill="${t.brand}"/>`);
    out.push(
      `  <text class="t" x="${x.toFixed(0)}" y="${y - 34}" text-anchor="middle">${esc(node.label)}</text>`,
    );
    if (node.sub) {
      out.push(
        `  <text class="m" x="${x.toFixed(0)}" y="${y + 42}" text-anchor="middle" ` +
          `style="font-size:19px">${esc(node.sub)}</text>`,
      );
    }
  });

  out.push('</svg>');
  return out.join('\n');
}

/** 声明 → SVG 字符串；type 不认识时返回 null，由调用方决定怎么提示 */
export function renderFigure(spec: FigureSpec): string | null {
  const theme = mergeTheme(spec.theme);
  switch (spec.type) {
    case 'flow':
      return renderFlow(spec, theme);
    case 'compare':
      return renderCompare(spec, theme);
    case 'bitfield':
      return renderBitfield(spec, theme);
    case 'timeline':
      return renderTimeline(spec, theme);
    default:
      return null;
  }
}
