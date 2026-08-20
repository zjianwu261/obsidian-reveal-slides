/**
 * 把一张图放进这一页的 fig 格子里（纯字符串处理，可单测）。
 *
 * 画图这条路和改文字那条不一样：模型只交回一张图，页面还是原来那页。
 * 所以这一步不能让模型重写整页 —— 它一重写就会顺手改动正文和讲稿，
 * 而你只是想换张图。这里只动 fig 那一格，别的一个字不碰。
 */

/** 图该占的格子；不给就用「图上文下」那一档 */
export interface FigureBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_BOX: FigureBox = { x: 4, y: 14, w: 92, h: 34 };

const FIG_GRID = /<grid([^>]*\bclass="fig"[^>]*)>([\s\S]*?)<\/grid>/;
const FIRST_GRID_END = /<\/grid>/;

/**
 * 这一页的 fig 格子占多大（从你写好的 dim/pos 里读）。
 * 没有 fig 格子、或者 dim 写得不是两个数，就返回 null。
 */
export function readFigureBox(page: string): FigureBox | null {
  const grid = FIG_GRID.exec(page);
  if (!grid) return null;

  const dim = /\bdim="\s*([\d.]+)[ \t]+([\d.]+)\s*"/.exec(grid[1]);
  if (!dim) return null;

  // pos 可以写成 top / center / bottomright 这类词，取不到数就当 0 ——
  // 画幅只看宽高，位置是多少不影响画出来的图长什么样
  const pos = /\bpos="\s*(-?[\d.]+)[ \t]+(-?[\d.]+)\s*"/.exec(grid[1]);
  return {
    w: Number(dim[1]),
    h: Number(dim[2]),
    x: pos ? Number(pos[1]) : 0,
    y: pos ? Number(pos[2]) : 0,
  };
}

/**
 * 页面源码 + 一行图片引用 → 新的页面源码。
 *
 * 已经有 fig 格子就只换掉里面的东西（原来是 svg 代码、旧图、还是空的都一样），
 * **标签上的 dim/pos 一个字不动** —— 那是你自己排的版，插件没有理由替你改。
 * 没有 fig 格子才新开一格，用给定的那一档，标题条留在最上面。
 */
export function placeFigure(page: string, embed: string, box: FigureBox = DEFAULT_BOX): string {
  const existing = FIG_GRID.exec(page);
  if (existing) {
    return page.replace(FIG_GRID, `<grid${existing[1]}>\n\n${embed}\n\n</grid>`);
  }

  const grid = [
    `<grid dim="${box.w} ${box.h}" pos="${box.x} ${box.y}" class="fig">`,
    '',
    embed,
    '',
    '</grid>',
  ].join('\n');

  const barEnd = FIRST_GRID_END.exec(page);
  if (!barEnd) return `${grid}\n\n${page.trim()}\n`;

  const at = barEnd.index + barEnd[0].length;
  return `${page.slice(0, at)}\n\n${grid}\n${page.slice(at)}`;
}
