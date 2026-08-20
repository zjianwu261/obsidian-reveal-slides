/**
 * 画图之前先让对话模型写提示词（纯字符串拼装，可单测）。
 *
 * 直接把「按这一页配张图」丢给画图模型，出来的都是泛泛的科技感插画 ——
 * 它没读过讲稿，不知道这一页在讲什么。先让读得懂中文的那个模型
 * 把讲稿里那件事翻成一句画得出来的英文提示词，再交给它画。
 */

/**
 * 标题条里的那行标题（`<grid class="bar">` 下的 ## 标题）。
 * 它划定这张图的范围 —— 讲稿常常从上一页的话头讲起，
 * 只看讲稿容易画到隔壁那件事上去。
 */
export function extractTitle(pageSource: string): string {
  for (const line of pageSource.split('\n')) {
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*$/.exec(line);
    if (heading) return heading[1];
  }
  return '';
}

/**
 * 讲稿在页面源码里的位置：notesSeparator（默认 note:）之后到页尾。
 * 单独抽出来是因为它才是这张图的题目 —— 幻灯片上那几行字是压缩过的结论，
 * 照着它画只能画出几个名词。
 */
export function extractNotes(pageSource: string, separator = 'note:'): string {
  const lines = pageSource.split('\n');
  const at = lines.findIndex((line) => line.trim().toLowerCase().startsWith(separator.toLowerCase()));
  if (at === -1) return '';
  const first = lines[at].trim().slice(separator.length).trim();
  return [first, ...lines.slice(at + 1)].join('\n').trim();
}

export const FIGURE_DESCRIBE_SYSTEM = `你在为一页大学课件想一张教学插图。
读用户给的这一页：**题目划定范围，note: 讲稿决定内容**，
幻灯片正文只是压缩过的结论，别照着它画。

你要输出的是一段中文的**画面描述** —— 写给画图的人看的：他没上过这门课，
只照着你的话把东西画出来。所以每一句都要是「看得见的东西」，
不是「这段代码的含义」。

讲稿常常从上一页的话头讲起、末尾又拐到下一页去 —— 题目是那把尺子：
讲稿里跟题目无关的那几句，一句都不要画。

## 先挑出要画的那一件事

一页只画一件。**讲稿里作者自己标了重心** —— 「重点讲」「最容易混淆」
「经常出错」「一定要记住」「我给大家举个最经典的例子」这类话之后的那一段，
就是他真正想让学生带走的东西，挑它。
讲稿罗列了五样东西时，**不要五样各画一格** —— 那画出来是一张图例，
不是一张讲解。

## 再决定画面

抽象的语义要找一个**日常场景**对应它：柜台、传送带、水杯倒水、抽屉换东西、
闸门、递条子。场景里的动作顺序必须和原理的顺序一一对得上。
硬件的内容就画硬件本身（LED、数码管、导线、按键、示波器上的方波）。

## 写法（这几条是硬的）

- **一句一件事，三到五句。** 第一句先说这张图要让学生看懂什么，
  后面每句描述画面里的一样东西：它是什么、在哪儿、朝哪个方向、什么在前什么在后。
  **不要写又长又绕的复句** —— 一句里塞进分号、"随后"、"才"、"与…汇合"，
  画图的人读不懂，画出来就是一团。
- **不要靠数量表达。** 「五个小球，然后第六个」这种画不出来 ——
  生成模型数不准个数，三个以上必错。要表达多与少，用**大小、满与空、
  有与无、位置的先后**。
- **不要出现数字、字母、公式、变量名。** 图里一个字都不会有。
  不要写「盒子上标着 a」——它标不上。要区分两个东西就用**形状和颜色**：
  「左边一个方盒子，右边一个圆罐子」。
- **画面里的东西不超过六样。** 数一数你写了几个名词，超了就删。
- **两格对照要说清楚两格是同一件事的正反面**（先改再用 vs 先用再改），
  不能是两个话题各占一格。只讲顺序的就写成一条从左到右的动作线，不要分格。
- **不用写风格**（扁平矢量、配色、光线这些插件会统一追加），
  也不用写"没有文字"。把字数全花在画面内容上。
- 总共 150 字以内。不要分点、不要小标题、不要引号。

**一个合格的样子**（仅示范语气和颗粒度，不要照抄内容）：

  让学生看懂"先把右边算完，再存进左边"。画面从左到右三步：
  最左边一只手把两颗糖放进一个托盘里，托盘中间合成一颗更大的糖。
  中间一个箭头指向右边一个方盒子。
  最右边这只手把那颗大糖放进方盒子，盒子里原来那颗小糖被顶了出来，掉在盒子外面。

**输出**：只输出这段描述本身，不要解释、不要引号、不要代码围栏。`;

/**
 * 中文描述 → 英文提示词。
 *
 * 描述那一步产出中文，是因为要给人改；改完这一步只做翻译，不许再创作 ——
 * 老师删掉的东西不能被这一步偷偷加回去。
 */
export const FIGURE_TRANSLATE_SYSTEM = `把用户给的这段中文画面描述翻成一句英文的图像生成提示词。

- **只翻译，不创作。** 不要增加描述里没有的东西，也不要省略里面有的。
  这段话是老师亲手改过的，改成什么样就画什么样。
- 不要写风格词（flat vector、lighting、palette 之类）—— 插件会统一追加。
- 一段话，不要分行、不要编号。

**输出**：只输出这句英文，不要解释、不要引号、不要代码围栏。`;

/**
 * 风格由插件追加，不写进描述里。
 *
 * 让模型每次自己想风格，等于每一页抽一次卡：这一章扁平矢量、下一章 3D 渲染，
 * 一本课件看着像好几个人拼的。定成几套现成的，挑一套用，整门课就统一了。
 */
export interface ImageStyle {
  id: string;
  name: string;
  /** 悬停时的一句话：什么内容适合这一套 */
  hint: string;
  body: string;
}

/** 每一套都得守的：投影要看得清，字一律不画 */
const STYLE_TAIL =
  'generous white space, plain uncluttered background, ' +
  'no text, no letters, no numbers, no labels, no watermark, no frame, no border.';

export const IMAGE_STYLES: ImageStyle[] = [
  {
    id: 'lecture',
    name: '课堂教学',
    hint: '默认。扁平矢量、一蓝一橙，最像课件里的图',
    body:
      'flat vector illustration for a university lecture slide, clean bold outlines, ' +
      'limited palette of one blue and one orange plus neutral grey, soft even lighting, ' +
      'plain white background, simple geometric shapes, no gradients, no shadows, ' +
      'no 3D rendering, no photorealism, no gears, no glowing circuits, no neon,',
  },
  {
    id: 'whiteboard',
    name: '白板手绘',
    hint: '像老师现场画的，讲推演过程时最自然',
    body:
      'hand-drawn whiteboard marker sketch, loose confident strokes, slightly uneven lines, ' +
      'black outlines with one blue and one red marker accent, white board background,',
  },
  {
    id: 'isometric',
    name: '等距示意',
    hint: '有层次的结构图，讲硬件和数据流向时好用',
    body:
      'isometric flat illustration, 30 degree axonometric view, clean edges, ' +
      'muted blue and orange palette with soft neutral shading, plain light background,',
  },
  {
    id: 'papercut',
    name: '剪纸拼贴',
    hint: '有质感、不呆板，讲比喻场景时出彩',
    body:
      'paper cut collage illustration, layered matte paper shapes with subtle drop shadows, ' +
      'warm limited palette, tactile handmade feel, plain light background,',
  },
  {
    id: 'photo',
    name: '写实照片',
    hint: '实物、器件、真实场景；抽象概念别用',
    body:
      'clean product photography, single subject on a plain seamless light background, ' +
      'soft diffused studio lighting, shallow depth of field, realistic materials,',
  },
];

export function imageStyleById(id: string): ImageStyle {
  return IMAGE_STYLES.find((style) => style.id === id) ?? IMAGE_STYLES[0];
}

/** 内容提示词 + 选中的风格 → 真正发给画图接口的那一串 */
export function withStyle(prompt: string, styleId = IMAGE_STYLES[0].id): string {
  const style = imageStyleById(styleId);
  return `${prompt.replace(/\s*$/, '').replace(/\.$/, '')}. Style: ${style.body} ${STYLE_TAIL}`;
}

export function buildFigureDescribeRequest(options: {
  pageSource: string;
  request: string;
  /** 页面里 note: 的写法，跟着设置走 */
  notesSeparator?: string;
}): string {
  // 两样单拎出来放在最前面：题目划范围，讲稿给内容。
  // 混在整页源码里，模型多半只扫一眼就动笔，画出来的跟这一页没关系
  const title = extractTitle(options.pageSource);
  const notes = extractNotes(options.pageSource, options.notesSeparator);

  const parts = [
    title ? `这一页的题目（图不能画到这个范围之外）：\n\n${title}` : '',
    notes
      ? `这一页的讲稿（图要讲的就是这段话里的事）：\n\n${notes}`
      : '这一页没有讲稿，只能按题目和正文来。',
    `这一页的完整源码：\n\n${options.pageSource}`,
    options.request ? `老师另外交代的：${options.request}` : '',
  ].filter(Boolean);

  return (
    `${parts.join('\n\n---\n\n')}\n\n` +
    '按上面的规矩写这一段中文描述。它必须写出画面里具体有什么、' +
    '谁在做什么动作 —— 光说主题是不行的。'
  );
}

/**
 * 模型偶尔会加引号、加一句「Here is the prompt:」，剥掉。
 * 提示词里带一层引号不会报错，但会被当成画面内容的一部分。
 */
export function cleanImagePrompt(reply: string): string {
  const withoutFence = reply.replace(/^```[^\n]*\n?|```$/g, '').trim();
  const withoutLead = withoutFence.replace(/^[^\n]*?(?:prompt|提示词)\s*[:：]\s*/i, '');
  return withoutLead.replace(/^["'“”]+|["'“”]+$/g, '').trim();
}

/** 三种画幅，按图要塞进多宽的格子挑 */
export type ImageShape = 'landscape' | 'portrait' | 'square';

export const IMAGE_SIZES: Record<ImageShape, string> = {
  landscape: '1536x1024',
  portrait: '1024x1536',
  square: '1024x1024',
};

/** 格子的宽高 → 画幅。差得不多就当方的，别为了 5% 的差别去要一张竖图 */
export function shapeForBox(width: number, height: number): ImageShape {
  if (height <= 0) return 'landscape';
  const ratio = width / height;
  if (ratio > 1.25) return 'landscape';
  if (ratio < 0.8) return 'portrait';
  return 'square';
}
