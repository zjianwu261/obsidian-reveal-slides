/**
 * 画图之前先让对话模型写提示词（纯字符串拼装，可单测）。
 *
 * 直接把「按这一页配张图」丢给画图模型，出来的都是泛泛的科技感插画 ——
 * 它没读过讲稿，不知道这一页在讲什么。先让读得懂中文的那个模型
 * 把「这一页要让人看懂哪件事、用什么比喻」写成一句提示词，再交给它画。
 */

export const IMAGE_PROMPT_SYSTEM = `你在为一页大学课件配图。读用户给的这一页（正文 + note: 讲稿），
写一句英文的图像生成提示词。

规矩：

1. **找一个看得见的比喻。** 讲稿讲的多半是抽象机制（先取值再自增、中断抢占、
   总线仲裁）。别去画抽象概念本身，画一个日常场景来对应它：柜台、传送带、
   闸门、排队、快递分拣。比喻要贴住原理 —— 顺序、因果、谁先谁后要对得上。
2. **图里不许有文字。** 生成模型写不好字，中文尤其糊成一团。
   提示词里明写 "no text, no letters, no numbers, no labels"。
   要说明的字由幻灯片正文承担，不靠图。
3. **画面要干净。** 一个主体、一件事、大量留白；不要多格漫画、不要密集元素、
   不要边框和水印。投到教室屏幕上，后排要能一眼看清。
4. **风格。** flat vector illustration, clean lines, limited palette
   (two or three colors plus neutrals), soft even lighting, plain light background。
   不要写实照片、不要 3D 渲染、不要赛博朋克霓虹。
5. 长度控制在 60 个英文词以内，一段话，不要分行、不要编号。

**输出**：只输出这句英文提示词本身，不要解释、不要引号、不要代码围栏。`;

export function buildImagePromptRequest(options: {
  pageSource: string;
  request: string;
}): string {
  return (
    `这一页的源码（含 note: 讲稿）：\n\n${options.pageSource}\n\n---\n\n` +
    `老师的要求：${options.request}\n\n` +
    '按上面的规矩写这一句英文提示词。'
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
