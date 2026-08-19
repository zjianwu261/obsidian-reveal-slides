/**
 * 版式选项（纯数据 + 拼装逻辑，可单测）。
 *
 * 「把这页排得好看点」对模型来说太含糊，它每次给的 dim/pos 都不一样。
 * 先指一个版式，再说要改什么 —— 位置由这里给死，模型只管内容。
 *
 * 每个选项的 boxes 就是提示词里那几行 grid 的真实百分比，
 * 界面上照着画成缩略图：看到的分布图和模型收到的数字是同一份。
 */

/** 缩略图里的一格。x/y/w/h 是画布百分比，与 grid 的 pos/dim 一致 */
export interface LayoutBox {
  kind: 'bar' | 'fig' | 'abstract' | 'code' | 'foot';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlideLayout {
  id: string;
  /** 缩略图下面那几个字 */
  name: string;
  /** 悬停时的一句话：什么时候该用它 */
  hint: string;
  boxes: LayoutBox[];
  /** 选中后附在请求后面的话 */
  instruction: string;
}

/** 标题条和页脚：每种版式都一样，画缩略图时垫在下面 */
const BAR: LayoutBox = { kind: 'bar', x: 0, y: 0, w: 100, h: 10 };
const FOOT: LayoutBox = { kind: 'foot', x: 0, y: 90, w: 100, h: 10 };

/** 并排时图会被压窄，图里的字得放大才跟正文一般大 */
const TEXT_SCALE = '并排时 ```figure 声明里要加 "textScale": 1.6，否则图里的字比正文小一圈。';

/** 标题条和页脚不归版式管 —— 这一页本来没有就别硬加 */
const KEEP = '标题条和页脚问句这一页本来有就保持原样，本来没有就不要加。';

export const SLIDE_LAYOUTS: SlideLayout[] = [
  {
    id: 'fig-top',
    name: '图上文下',
    hint: '首选。flow / bitfield / timeline 这类宽扁的图',
    boxes: [BAR, { kind: 'fig', x: 4, y: 14, w: 92, h: 34 }, { kind: 'abstract', x: 4, y: 52, w: 92, h: 26 }, FOOT],
    instruction:
      '把这一页排成上下结构：图占满整行放在上面 <grid dim="92 34" pos="4 14" class="fig">，' +
      `文字在下面 <grid dim="92 26" pos="4 52" class="abstract">。${KEEP}`,
  },
  {
    id: 'fig-bottom',
    name: '文上图下',
    hint: '结论先摆出来，图在下面收尾',
    boxes: [BAR, { kind: 'abstract', x: 4, y: 14, w: 92, h: 24 }, { kind: 'fig', x: 4, y: 42, w: 92, h: 36 }, FOOT],
    instruction:
      '把这一页排成上下结构，文字在上、图在下：<grid dim="92 24" pos="4 14" class="abstract">，' +
      `<grid dim="92 36" pos="4 42" class="fig">。${KEEP}`,
  },
  {
    id: 'fig-left',
    name: '图左文右',
    hint: 'compare 这类偏方的图，或文字较多时',
    boxes: [BAR, { kind: 'fig', x: 4, y: 15, w: 58, h: 66 }, { kind: 'abstract', x: 62, y: 15, w: 36, h: 66 }],
    instruction:
      '把这一页排成左右结构：图在左占大半 <grid dim="58 66" pos="4 15" class="fig">，' +
      `文字在右 <grid dim="36 66" pos="62 15" class="abstract">。${TEXT_SCALE}${KEEP}`,
  },
  {
    id: 'fig-right',
    name: '文左图右',
    hint: '先读文字再看图的页面',
    boxes: [BAR, { kind: 'abstract', x: 4, y: 15, w: 36, h: 66 }, { kind: 'fig', x: 42, y: 15, w: 58, h: 66 }],
    instruction:
      '把这一页排成左右结构，文字在左 <grid dim="36 66" pos="4 15" class="abstract">，' +
      `图在右占大半 <grid dim="58 66" pos="42 15" class="fig">。${TEXT_SCALE}${KEEP}`,
  },
  {
    id: 'text-only',
    name: '通栏正文',
    hint: '不配图，只留一页大纲',
    boxes: [BAR, { kind: 'abstract', x: 4, y: 14, w: 92, h: 64 }, FOOT],
    instruction:
      '这一页不要图，正文通栏 <grid dim="92 64" pos="4 14" class="abstract">，' +
      `整理成两级列表、总行数不超过 10 行。${KEEP}`,
  },
  {
    id: 'code-left',
    name: '代码带说明',
    hint: '代码在左，右边一句一句讲',
    boxes: [BAR, { kind: 'code', x: 4, y: 15, w: 58, h: 66 }, { kind: 'abstract', x: 62, y: 15, w: 36, h: 66 }],
    instruction:
      '把这一页排成代码页：代码在左 <grid dim="58 66" pos="4 15" class="code">，' +
      '说明在右 <grid dim="36 66" pos="62 15" class="abstract">。' +
      `代码不超过 15 行，用 \`\`\`c [行号] 标出这节要讲的行。${KEEP}`,
  },
];

/**
 * 输入框里的话 + 选中的版式 → 发给模型的请求。
 * 版式排在后面：先听人说要改什么，再补一句排到哪儿。
 * 什么都没打就只发版式 —— 点一下就想直接重排，这是最常见的用法。
 */
export function composeRequest(text: string, layout: SlideLayout | null): string {
  const request = text.trim();
  if (!layout) return request;
  if (!request) return layout.instruction;
  return `${request}\n\n${layout.instruction}`;
}
