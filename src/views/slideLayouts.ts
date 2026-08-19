/**
 * 版式选项（纯数据 + 拼装逻辑，可单测）。
 *
 * 「把这页排得好看点」对模型来说太含糊，它每次给的 dim/pos 都不一样。
 * 先指一个版式，位置就由这里给死，模型只管往格子里填内容。
 *
 * 每个选项只存一份 boxes：界面照着它画缩略图，发给模型的 dim/pos 也从它算出来 ——
 * 一份数据两处用，画的和发的就不会各说各话。
 */

/** 缩略图里的一格。x/y/w/h 是画布百分比，与 grid 的 pos/dim 一致 */
export interface LayoutBox {
  kind: 'bar' | 'fig' | 'abstract' | 'code' | 'foot';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 版式管得着的块（标题条和页脚每页都一样，不归版式挑） */
export type LayoutBlock = 'fig' | 'abstract' | 'code';

export interface SlideLayout {
  id: string;
  /** 缩略图下面那几个字 */
  name: string;
  /** 悬停时的一句话：什么时候该用它 */
  hint: string;
  boxes: LayoutBox[];
}

/** 标题条和页脚：每种版式都一样，画缩略图时垫在下面 */
const BAR: LayoutBox = { kind: 'bar', x: 0, y: 0, w: 100, h: 10 };
const FOOT: LayoutBox = { kind: 'foot', x: 0, y: 90, w: 100, h: 10 };

const BLOCK_NAME: Record<LayoutBlock, string> = { fig: '图', abstract: '正文', code: '代码' };

/** 标题条和页脚不归版式管 —— 这一页本来没有就别硬加 */
const KEEP = '标题条和页脚问句这一页本来有就保持原样，本来没有就不要加。';

export const SLIDE_LAYOUTS: SlideLayout[] = [
  {
    id: 'fig-top',
    name: '图上文下',
    hint: 'flow / bitfield / timeline 这类宽扁的图',
    boxes: [
      BAR,
      { kind: 'fig', x: 4, y: 14, w: 92, h: 34 },
      { kind: 'abstract', x: 4, y: 52, w: 92, h: 26 },
      FOOT,
    ],
  },
  {
    id: 'fig-bottom',
    name: '文上图下',
    hint: '结论先摆出来，图在下面收尾',
    boxes: [
      BAR,
      { kind: 'abstract', x: 4, y: 14, w: 92, h: 24 },
      { kind: 'fig', x: 4, y: 42, w: 92, h: 36 },
      FOOT,
    ],
  },
  {
    id: 'fig-left',
    name: '图左文右',
    hint: '默认。图占大半、要点在右，一眼同时看见两边',
    boxes: [
      BAR,
      { kind: 'fig', x: 4, y: 15, w: 58, h: 66 },
      { kind: 'abstract', x: 62, y: 15, w: 36, h: 66 },
    ],
  },
  {
    id: 'fig-right',
    name: '文左图右',
    hint: '先读文字再看图的页面',
    boxes: [
      BAR,
      { kind: 'abstract', x: 4, y: 15, w: 36, h: 66 },
      { kind: 'fig', x: 42, y: 15, w: 58, h: 66 },
    ],
  },
  {
    id: 'text-only',
    name: '通栏正文',
    hint: '不配图，只留一页大纲',
    boxes: [BAR, { kind: 'abstract', x: 4, y: 14, w: 92, h: 64 }, FOOT],
  },
  {
    id: 'code-left',
    name: '代码带说明',
    hint: '代码在左，右边一句一句讲',
    boxes: [
      BAR,
      { kind: 'code', x: 4, y: 15, w: 58, h: 66 },
      { kind: 'abstract', x: 62, y: 15, w: 36, h: 66 },
    ],
  },
];

/**
 * 没另外挑过时用哪一档。图左文右：图占大半、文字在右窄栏，
 * 一眼能同时看见图和要点，是这门课最常用的排法。
 */
export const DEFAULT_LAYOUT_ID = 'fig-left';

export function layoutById(id: string): SlideLayout | null {
  return SLIDE_LAYOUTS.find((layout) => layout.id === id) ?? null;
}

/** 一格的写法：<grid dim="92 34" pos="4 14" class="fig"> */
function gridTag(box: LayoutBox): string {
  return `<grid dim="${box.w} ${box.h}" pos="${box.x} ${box.y}" class="${box.kind}">`;
}

/** 图没占满整行就是被压窄了，图里的字得放大才跟正文一般大 */
function isNarrowFigure(box: LayoutBox): boolean {
  return box.kind === 'fig' && box.w < 88;
}

const TEXT_SCALE =
  '这个宽度下图会被压窄，```figure 声明里要加 "textScale": 1.6；' +
  '手绘 ```svg 的话把 viewBox 取得偏方一些（如 600×500），字号相应放大。';

export function findBox(layout: SlideLayout, block: LayoutBlock): LayoutBox | null {
  return layout.boxes.find((box) => box.kind === block) ?? null;
}

/**
 * 只改一块时附的话：宽高由版式定死。
 *
 * 「配一张图」如果不说宽度，模型每次给的 dim 都不一样，
 * 而图里的字该多大又恰恰取决于它被塞进多宽的格子 —— 宽度定了，字号才有准。
 */
export function blockInstruction(layout: SlideLayout, block: LayoutBlock): string | null {
  const box = findBox(layout, block);
  if (!box) return null;

  const scale = isNarrowFigure(box) ? ` ${TEXT_SCALE}` : '';
  return (
    `这一块按「${layout.name}」的位置来：${BLOCK_NAME[block]}放进 ${gridTag(box)}，` +
    `dim 和 pos 照抄，不要自己改。${scale}页上其余的块保持原样。`
  );
}

/** 整页重排时附的话：每一块都给死位置 */
export function layoutInstruction(layout: SlideLayout): string {
  const blocks = layout.boxes.filter((box): box is LayoutBox & { kind: LayoutBlock } =>
    box.kind === 'fig' || box.kind === 'abstract' || box.kind === 'code',
  );
  const parts = blocks.map((box) => `${BLOCK_NAME[box.kind]} ${gridTag(box)}`);
  const scale = blocks.some(isNarrowFigure) ? ` ${TEXT_SCALE}` : '';
  return `把这一页排成「${layout.name}」：${parts.join('，')}。${scale}${KEEP}`;
}

/**
 * 这句话是冲着哪一块去的？
 *
 * 靠请求里提到的 class 判断 —— /fig 和 /abstract 填进来的话里各自只有一个 class，
 * 认它就够了，不必在界面上另记一份「刚才点的是哪条命令」（那份状态一改字就作废）。
 * 一句话里同时提到两块（或一块都没提）就是整页重排。
 */
export function requestedBlock(text: string): LayoutBlock | null {
  const mentioned = (['fig', 'abstract', 'code'] as LayoutBlock[]).filter((block) =>
    text.includes(`class="${block}"`),
  );
  return mentioned.length === 1 ? mentioned[0] : null;
}

/**
 * 输入框里的话 + 选中的版式 → 发给模型的请求。
 * 版式排在后面：先听人说要改什么，再补一句排到哪儿。
 * 什么都没打就只发版式 —— 点一下就想直接重排，这是最常见的用法。
 *
 * 请求只冲着一块去（/fig、/abstract）时，只把那一块的宽高附上；
 * 版式里根本没有这一块（拿「通栏正文」配图）时不附版式，交给上层去提醒。
 */
export function composeRequest(text: string, layout: SlideLayout | null): string {
  const request = text.trim();
  if (!layout) return request;

  const block = requestedBlock(request);
  const clause = block ? blockInstruction(layout, block) : layoutInstruction(layout);
  if (!clause) return request;
  if (!request) return clause;
  return `${request}\n\n${clause}`;
}
