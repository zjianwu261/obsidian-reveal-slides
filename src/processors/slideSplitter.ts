export interface RawSlide {
  content: string;
  type: 'horizontal' | 'vertical';
}

export interface SplitResult {
  slides: RawSlide[];
}

type Range = [number, number];

/**
 * 标记代码块 / 行内代码的范围，分页时跳过这些范围内的分隔符。
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
    if (!isInsideRanges(start, ranges)) {
      ranges.push([start, start + match[0].length]);
    }
  }

  return ranges;
}

function isInsideRanges(index: number, ranges: Range[]): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/** 按正则分割，但忽略代码范围内的匹配 */
function splitOutsideCode(text: string, separator: RegExp, ranges: Range[]): string[] {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(separator)) {
    const start = match.index;
    if (isInsideRanges(start, ranges)) continue;
    parts.push(text.slice(last, start));
    last = start + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

/**
 * 幻灯片分页器。
 * 1. 按水平分隔符分页；
 * 2. 每块内部再按垂直分隔符分页（首块为 horizontal，其余为 vertical）；
 * 3. headingDivider 设置时，指定级别的标题另起新页。
 */
export function splitSlides(
  body: string,
  separator: string,
  verticalSeparator: string,
  headingDivider?: number[] | null,
): SplitResult {
  const ranges = findCodeRanges(body);

  let horizontalRe: RegExp;
  try {
    horizontalRe = new RegExp(separator, 'g');
  } catch {
    horizontalRe = /\r?\n---\r?\n/g;
  }

  let horizontalChunks = splitOutsideCode(body, horizontalRe, ranges);

  if (headingDivider && headingDivider.length > 0) {
    const maxLevel = Math.max(...headingDivider);
    const headingRe = new RegExp(`\\r?\\n(?=#{1,${maxLevel}}\\s)`, 'g');
    const levels = new Set(headingDivider);
    const refined: string[] = [];
    for (const chunk of horizontalChunks) {
      const subs = splitOutsideCode(chunk, headingRe, ranges);
      subs.forEach((sub, i) => {
        const headingMatch = /^(#{1,6})\s/.exec(sub.trimStart());
        const triggeredByHeading = i > 0;
        if (triggeredByHeading && headingMatch && !levels.has(headingMatch[1].length)) {
          // 该标题级别不在设定中：并回上一块（补回被正则吞掉的换行）
          refined[refined.length - 1] += '\n' + sub;
        } else {
          refined.push(sub);
        }
      });
    }
    horizontalChunks = refined;
  }

  let verticalRe: RegExp | null = null;
  try {
    verticalRe = new RegExp(verticalSeparator, 'g');
  } catch {
    verticalRe = /\r?\nxxx\r?\n/g;
  }

  const slides: RawSlide[] = [];
  for (const chunk of horizontalChunks) {
    const parts = splitOutsideCode(chunk, verticalRe, ranges);
    parts.forEach((content, i) => {
      slides.push({
        content,
        type: i === 0 ? 'horizontal' : 'vertical',
      });
    });
  }

  return { slides };
}
