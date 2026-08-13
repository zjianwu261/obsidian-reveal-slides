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

  // 行内代码（可跨行，排除已在围栏代码块内的部分）
  const inlineRe = /`[^`]+`/g;
  for (const match of text.matchAll(inlineRe)) {
    const start = match.index;
    if (!isInsideCode(start, ranges)) {
      ranges.push([start, start + match[0].length]);
    }
  }

  return ranges;
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
