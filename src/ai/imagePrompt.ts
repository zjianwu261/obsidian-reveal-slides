/**
 * 画图之前先让对话模型写提示词（纯字符串拼装，可单测）。
 *
 * 直接把「按这一页配张图」丢给画图模型，出来的都是泛泛的科技感插画 ——
 * 它没读过讲稿，不知道这一页在讲什么。先让读得懂中文的那个模型
 * 把讲稿里那件事翻成一句画得出来的英文提示词，再交给它画。
 */

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

export const IMAGE_PROMPT_SYSTEM = `你在为一页大学课件配一张教学插图。
读用户给的这一页 —— **以 note: 讲稿为准**，幻灯片正文只是压缩过的结论。
你要输出的是一句英文的图像生成提示词。

先在心里回答三个问题，再动笔：

  1. 这一页的讲稿在讲哪一个**过程或差别**？（谁先谁后、多了什么少了什么、
     哪一步出了错）一页只挑一件，挑最容易讲错的那件。
  2. 这件事在现实里长什么样？硬件的内容就画硬件本身（LED、数码管、
     导线、按键、示波器上的方波）；抽象的语义就找一个日常场景对应它，
     场景里的动作顺序必须和原理的顺序一一对得上。
  3. 画面怎么摆才**看得出这件事**？左右对照、上下两步、一条箭头贯穿 ——
     摆法本身要能承担讲解，不能靠文字补。

然后按这几条写提示词：

- **具体。** 写出画面里到底有什么东西、谁在做什么动作、朝哪个方向。
  不要写 "concept of increment"、"programming illustration" 这种词 ——
  画图模型对抽象名词只会回你一堆发光的电路和齿轮。
- **可以左右对照，但最多两格。** 讲差别的内容画成 side-by-side 两幅，
  中间一条细分隔线；讲顺序的画成一条从左到右的动作线。三格以上就乱了。
- **图里不许有文字。** 生成模型写不好字，中文尤其糊成一团。
  提示词末尾写死 "no text, no letters, no numbers, no labels, no watermark"。
  要说明的字由幻灯片正文承担。
- **画面干净。** 大量留白，plain light background，没有边框和背景装饰。
  投到教室屏幕上后排要能一眼看清。
- **风格。** flat vector illustration, clean bold outlines, limited palette
  (two or three colors plus neutrals), soft even lighting。
  不要写实照片、不要 3D 渲染、不要霓虹赛博朋克。
- 一段话，80 个英文词以内，不要分行、不要编号。

**输出**：只输出这句英文提示词本身，不要解释、不要引号、不要代码围栏。`;

export function buildImagePromptRequest(options: {
  pageSource: string;
  request: string;
  /** 页面里 note: 的写法，跟着设置走 */
  notesSeparator?: string;
}): string {
  const notes = extractNotes(options.pageSource, options.notesSeparator);
  // 讲稿单拎出来放在最前面：混在整页源码里，模型多半只扫一眼标题就动笔了
  const lead = notes
    ? `这一页的讲稿（图要讲的就是这段话里的事）：\n\n${notes}\n\n---\n\n`
    : '这一页没有讲稿，只能按正文来。\n\n';

  return (
    `${lead}这一页的完整源码：\n\n${options.pageSource}\n\n---\n\n` +
    `老师的要求：${options.request}\n\n` +
    '按上面的规矩写这一句英文提示词。它必须写出画面里具体有什么、' +
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
