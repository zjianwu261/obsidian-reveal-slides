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

/** 把标签里的 dim/pos 换成这一档的数字；没写过的就补上 */
function retag(attributes: string, box: FigureBox): string {
  const dim = `dim="${box.w} ${box.h}"`;
  const pos = `pos="${box.x} ${box.y}"`;
  const withDim = /\bdim="[^"]*"/.test(attributes)
    ? attributes.replace(/\bdim="[^"]*"/, dim)
    : ` ${dim}${attributes}`;
  return /\bpos="[^"]*"/.test(withDim)
    ? withDim.replace(/\bpos="[^"]*"/, pos)
    : withDim.replace(dim, `${dim} ${pos}`);
}

/**
 * 页面源码 + 一行图片引用 → 新的页面源码。
 *
 * 已经有 fig 格子就换掉里面的东西（原来是 svg 代码、旧图、还是空的都一样）；
 * 没有就在标题条后面新开一格 —— 标题总该留在最上面。
 */
export function placeFigure(page: string, embed: string, box: FigureBox = DEFAULT_BOX): string {
  const existing = FIG_GRID.exec(page);
  if (existing) {
    const tag = `<grid${retag(existing[1], box)}>`;
    return page.replace(FIG_GRID, `${tag}\n\n${embed}\n\n</grid>`);
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
