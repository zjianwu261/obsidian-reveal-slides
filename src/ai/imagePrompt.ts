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

先有创意，再落笔。给这页的道理找一个**出人意料又贴切的日常比喻** ——
不要用「盒子装东西」「箭头指向」这种第一反应的万能画面，
从厨房、集市、交通、游戏、运动里挑一个动作感强的场景：
柜台找零、接力赛交棒、水龙头接水、排长队、换人上场、快递分拣。
场景里的每个角色、每个动作，都要和原理里的每一步一一对得上；
对不上的比喻，再漂亮也不要。
画面要有主角：谁在动手、谁是被动的那个，一眼看得出。
写的时候用形象的表达 —— 说「被顶了出来，掉在盒子外面」，
不说「旧值被覆盖」。比喻要具体到看得见的样子，不停在概念上。
硬件的内容就画硬件本身（LED、数码管、导线、按键、示波器上的方波）。

## 写成这个格式（四行，一个字段一行）

  场景：一句话，这张图借的是什么日常场景。
  构图：整张图怎么摆。只有两种 ——「从左到右三步」或者「左右两格对照」。
  画面：三到五件事，分号隔开，每件写「在哪儿 + 是什么 + 在做什么」。
  重点：整张图最该一眼看到的那一处。

分成四行是为了好改：不满意换个比喻就重写「场景」那一行，
嫌乱就删「画面」里的一件，别的不动。

## 写法（这几条是硬的）

- **四行里写的全是画面。** 「让学生看懂……」「这张图展示了……」这种话一句都不要 ——
  它不是画面，画图的人画不出来，只会把整段带成抽象讲解。
- **画面那行一件事一小句。** 它是什么、在哪儿、朝哪个方向、什么在前什么在后，
  写完打分号。**不要又长又绕的复句** —— 一句里塞进"随后""才""与…汇合"，
  画图的人读不懂，画出来就是一团。
- **不许出现抽象词。** 「结果」「替换」「合成」「赋值」「值」「逻辑」都不是东西，
  画不出来。它们一冒出来，说明你还在讲概念、没翻成画面 —— 换成具体动作：
  「旧的被顶出来，掉在地上；新的放了进去」。
- **动作链最多三步，别来回倒腾。** 「倒进碗里、再倒回罐子」这种两步搬运，
  画出来只剩乱。能一步到的就不要绕。
- **画完自查一遍对照：原理里没动的东西，画面里也不许动。**
  「a = a + b」里 b 算完还是原来那个数 —— 那画面里对应 b 的那样东西
  就必须原地待着；它要是也被搬空了，这张图讲的就是错的。
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
- 四行加起来 180 字以内。不要引号、不要再加别的字段。

**一个合格的样子**（仅示范格式和颗粒度，不要照抄内容、也别借它的场景）：

  场景：售票窗口前的一条队伍。
  构图：从左到右三步。
  画面：最左边一个人刚走到队尾，正排上来；中间排队的人一个挨一个，都朝右边的窗口看；
  最右边窗口里递出一张票，队首的人伸手接过，转身要走。
  重点：递票的那只手。

**输出**：只输出这四行，不要解释、不要引号、不要代码围栏。`;

/**
 * 中文描述 → 英文提示词，顺手把题目也翻了 —— 最终发给画图模型的提示词
 * 由三段拼成：主题、画面、风格，主题这一段也得是英文，不能一半是中文。
 *
 * 描述那一步产出中文，是因为要给人改；改完这一步只做翻译，不许再创作 ——
 * 老师删掉的东西不能被这一步偷偷加回去。
 */
export const FIGURE_TRANSLATE_SYSTEM = `把用户给的两段中文翻成英文，供图像生成模型使用。
用户给的格式固定是两行：

Theme: 这一页的题目（划定这张图的范围，不是画面内容）
Scene: 画面设定（老师亲手改过的，改成什么样就画什么样）

Scene 那一段是四行：场景、构图、画面、重点。翻的时候把它们捏成一段连贯的英文：

- **场景**是这幅画的设定，先说它。
- **构图**决定整体布局：「从左到右三步」译成一条水平的动作线；
  「左右两格对照」译成 side-by-side two panels split by a thin divider。
- **画面**逐件翻，一件不多一件不少。
- **重点**译成让那一处更显眼的说法（larger, in the foreground,
  the only orange element 之类）。
- **只翻译，不创作。** 不要增加里面没有的东西，也不要省略里面有的。
- 不要写风格词（flat vector、lighting、palette 之类）—— 插件会统一追加。
- Theme 翻成几个词的短语，Scene 翻成一段话，都不要分行编号。

**输出**：严格输出下面两行，不要解释、不要引号、不要代码围栏：

Theme: <题目的英文>
Scene: <画面描述的英文>`;

/** 给翻译那一步的两行输入：题目 + 改定的画面描述 */
export function buildFigureTranslateRequest(theme: string, description: string): string {
  return `Theme: ${theme.trim() || '（这一页没有题目）'}\nScene: ${description.trim()}`;
}

/**
 * 把翻译那一步的两行输出拆回题目和画面。
 * 模型没按格式来时兜底：题目留原来的中文，整段输出当画面 ——
 * 画出来的图可能对，但流程不能在这儿卡死。
 */
export function parseFigureTranslation(
  reply: string,
  fallbackTheme: string,
): { theme: string; scene: string } {
  const theme = /^\s*Theme:\s*(.+?)\s*$/m.exec(reply)?.[1] ?? '';
  const scene = /^\s*Scene:\s*([\s\S]+?)\s*$/m.exec(reply)?.[1] ?? '';
  const themeMissing = !theme || theme.includes('没有题目');
  return {
    theme: themeMissing ? fallbackTheme.trim() : theme,
    scene: cleanImagePrompt(scene || reply),
  };
}

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

/**
 * 最终发给画图模型的提示词，三段拼成：
 * 题目（划范围）→ 画面描述（讲什么）→ 风格（怎么画）。
 *
 * 题目要说清「只是范围、不许画成字」—— 不讲这句，
 * 画图模型会把题目当成要写进图里的字。
 */
export function composeImagePrompt(theme: string, scene: string, styleId = IMAGE_STYLES[0].id): string {
  const styled = withStyle(scene, styleId);
  if (!theme.trim()) return styled;
  return (
    `Theme: ${theme.trim()} — this names the topic the picture must stay on; ` +
    `use it as context only, never render it as text.\n${styled}`
  );
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
