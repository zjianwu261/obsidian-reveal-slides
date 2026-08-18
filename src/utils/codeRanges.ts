/**
 * 代码范围（围栏代码块 + 行内代码）的定位与「跳过代码」的替换。
 *
 * ⚠️ 所有**渲染前**在 Markdown 文本上做抽取的处理器都必须走这里：
 * 代码块里的 `<grid>` / `<split>` / `<style>` / `<!-- .element: -->` / `note:`
 * 是给人看的示例，不是标记。若照常解析，写一页「教语法」的幻灯片就会看到
 * 示例消失、真的 grid 浮在页面上，或者示例 CSS 被当成文档样式套到整个 deck 上。
 * 分页器一开始就防住了这一点，其余处理器此前都没有 —— 统一收在此处。
 *
 * ⚠️ 本文件不得 import 'path' 等 Node 内置模块：移动端会加载它。
 */

export type Range = [number, number];

/**
 * 标记代码块 / 行内代码的范围。
 * 未闭合的围栏按「延伸到文本末尾」处理，与 Markdown 渲染器的行为一致。
 */
export function findCodeRanges(text: string): Range[] {
  const ranges: Range[] = [];

  // 围栏代码块 ``` 或 ~~~
  const fenceRe = /^(`{3,}|~{3,})[^\n]*\r?\n[\s\S]*?(?:^\1[ \t]*$|$(?![\s\S]))/gm;
  for (const match of text.matchAll(fenceRe)) {
    ranges.push([match.index, match.index + match[0].length]);
  }

  /*
   * 行内代码要在「挖掉围栏块」的副本上扫，不能直接扫原文。
   * 直接扫的话，收尾那行 ``` 的第三个反引号会拉出一个伪匹配（起点在围栏内，
   * 一路吃到围栏后面第一个反引号）：它因起点在代码里被丢弃，但反引号已被消耗，
   * 此后每一对反引号都配错位 —— 「行内代码」落在真的行内代码之间的空隙上。
   * 空隙里要是有 note: / xxx / --- / <grid>，就会被当成代码整段跳过：备注混进正文、
   * 该分的页不分、几页内容叠在一张画布上。
   * 等长空白替换保住了下标，匹配结果可直接映射回原文。
   *
   * 扫的时候还要按段落切开，理由见 paragraphRanges。
   */
  const masked = maskRanges(text, ranges);
  const inlineRe = /`[^`]+`/g;
  for (const [start, end] of paragraphRanges(masked)) {
    for (const match of masked.slice(start, end).matchAll(inlineRe)) {
      ranges.push([start + match.index, start + match.index + match[0].length]);
    }
  }

  return ranges;
}

/**
 * 按空行切段（空行本身不属于任何段）。
 *
 * 行内代码必须逐段扫：CommonMark 里 code span 是行内元素，跨不过空行 ——
 * 而落单的反引号（打字漏了一个、中文引号旁边多按了一下）如果放任它跨段配对，
 * 就会跟老远之后的另一个反引号凑成一对，把中间整片文字标成「代码」。
 * 那片文字里的 note: / xxx / --- / <grid> 会被一并跳过：讲稿漏进正文、该分的页不分，
 * 半篇课件叠成一张。逐段扫之后，一个落单的反引号最多祸害它自己那一段。
 */
function paragraphRanges(text: string): Range[] {
  const ranges: Range[] = [];
  let start: number | null = null;
  let offset = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      if (start !== null) ranges.push([start, offset]);
      start = null;
    } else if (start === null) {
      start = offset;
    }
    offset += line.length + 1; // +1 为被 split 吃掉的 \n
  }
  if (start !== null) ranges.push([start, text.length]);

  return ranges;
}

/**
 * 把给定区间替换成等长空格（换行保留，下标与行号都不变）。
 * ranges 需按起点升序且互不重叠 —— matchAll 的结果天然如此。
 */
function maskRanges(text: string, ranges: Range[]): string {
  if (ranges.length === 0) return text;

  let result = '';
  let last = 0;
  for (const [start, end] of ranges) {
    result += text.slice(last, start) + text.slice(start, end).replace(/[^\n]/g, ' ');
    last = end;
  }
  return result + text.slice(last);
}

/** 下标是否落在任一代码范围内 */
export function isInsideCode(index: number, ranges: Range[]): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * 跳过代码范围的 replace：匹配**起点**在代码里就原样保留。
 *
 * 判定只看起点（与分页器一致）：跨进代码块的半截标签本就是坏输入，
 * 按普通标记处理即可，不值得为它把规则复杂化。
 *
 * pattern 需带 g 标志；replacer 拿到的参数与 String.replace 的一致（不支持具名捕获组）。
 */
export function replaceOutsideCode(
  text: string,
  pattern: RegExp,
  replacer: (match: string, ...groups: (string | undefined)[]) => string,
): string {
  const ranges = findCodeRanges(text);
  if (ranges.length === 0) {
    return text.replace(pattern, replacer as (...args: string[]) => string);
  }

  return text.replace(pattern, (...args: unknown[]) => {
    const whole = args[0] as string;
    // replace 的尾参依次是 offset、原字符串；从后往前找到的第一个数字即 offset，
    // 它与 whole 之间的部分才是捕获组。
    let offsetIndex = args.length - 1;
    while (offsetIndex > 0 && typeof args[offsetIndex] !== 'number') offsetIndex--;

    if (isInsideCode(args[offsetIndex] as number, ranges)) return whole;
    return replacer(whole, ...(args.slice(1, offsetIndex) as (string | undefined)[]));
  });
}
