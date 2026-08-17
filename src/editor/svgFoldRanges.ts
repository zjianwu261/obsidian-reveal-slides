/**
 * ```svg 围栏块的折叠区间定位（纯函数，不依赖 CodeMirror / Obsidian）。
 *
 * 区间从**围栏行末**（那个换行符本身）到**结束围栏行末**，
 * 与 Obsidian 折叠代码块的范围一致：折起来后 ```svg 那行仍留在原位，点它展开。
 */

/** 内容不足这么多行的块不折：省不下几行，反倒多一次点击 */
export const MIN_FOLD_LINES = 4;

export interface FoldRange {
  from: number;
  to: number;
}

/** 围栏起始行：``` 或 ~~~ 加信息串 */
const FENCE_RE = /^(`{3,}|~{3,})(.*)$/;

/** 结束围栏：同种字符、不短于开启围栏，且整行没有别的内容 */
function isClosingFence(line: string, fence: string): boolean {
  return new RegExp(`^[${fence[0]}]{${fence.length},}$`).test(line);
}

/**
 * 找出文本里所有可折叠的 ```svg 块（字符下标区间）。
 *
 * 逐行扫描而不是一条正则：嵌套围栏必须按「开着的那道栏」判断结束，
 * 否则一篇讲语法的笔记里 ````markdown 包着的 ```svg 示例会被当成真块折掉。
 * 未闭合的围栏不产生区间 —— 折一个没有结尾的块会把后面的正文一起吞掉。
 */
export function findSvgFoldRanges(text: string, minLines = MIN_FOLD_LINES): FoldRange[] {
  const ranges: FoldRange[] = [];

  /** 当前打开的围栏原文（null = 不在块内） */
  let fence: string | null = null;
  let isSvg = false;
  let from = 0;
  let contentLines = 0;
  let offset = 0;

  for (const line of text.split('\n')) {
    // CRLF 的 \r 留在行内，trim 掉只影响匹配，不影响下标
    const trimmed = line.trim();
    const lineEnd = offset + line.length;

    if (fence === null) {
      const match = FENCE_RE.exec(trimmed);
      if (match) {
        fence = match[1];
        // 信息串正好是 svg 才折，```svg-example 这类不动
        isSvg = match[2].trim().toLowerCase() === 'svg';
        from = lineEnd;
        contentLines = 0;
      }
    } else if (isClosingFence(trimmed, fence)) {
      if (isSvg && contentLines >= minLines) ranges.push({ from, to: lineEnd });
      fence = null;
    } else {
      contentLines++;
    }

    offset = lineEnd + 1; // 跳过 \n
  }

  return ranges;
}
