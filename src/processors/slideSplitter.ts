import { findCodeRanges, isInsideCode } from '../utils/codeRanges';

export interface RawSlide {
  content: string;
  type: 'horizontal' | 'vertical';
  /** 本页正文在 body 中的起始字符下标（供「光标跟随」换算行号） */
  offset: number;
}

/** 分割结果的一段：内容 + 它在原字符串中的起始下标 */
interface Chunk {
  text: string;
  offset: number;
}

export interface SplitResult {
  slides: RawSlide[];
}

/**
 * 按正则分割，但忽略代码范围内的匹配。
 * 代码范围按传入的 text 现算：分页是多轮的（水平 → headingDivider → 垂直），
 * 后续轮次拿到的是子串，复用上一轮的下标会整体错位。
 */
function splitOutsideCode(text: string, separator: RegExp, baseOffset = 0): Chunk[] {
  const ranges = findCodeRanges(text);
  const parts: Chunk[] = [];
  let last = 0;
  for (const match of text.matchAll(separator)) {
    const start = match.index;
    if (isInsideCode(start, ranges)) continue;
    parts.push({ text: text.slice(last, start), offset: baseOffset + last });
    last = start + match[0].length;
  }
  parts.push({ text: text.slice(last), offset: baseOffset + last });
  return parts;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const REGEX_META_RE = /[\\^$.*+?()[\]{}|]/;

/** 行尾空白：允许 '---  ' 这种带尾随空格的分隔行 */
const TRAILING_WS = '[ \\t]*';

/**
 * 分隔行末尾的换行，两种写法都要认：
 * 设置项默认值是用 TS 转义写的（真的 CR/LF 字符），而用户在设置输入框里手打的是
 * 反斜杠 + r / n 两个字符。
 */
const NEWLINE_TAIL_RE = /(?:\\r\?|\r\?)?(?:\\n|\n)$/;

/**
 * 分隔符归一化：
 * - 含正则元字符 → 按正则编译（默认 '\r?\n---\r?\n' 走这条路）；
 * - 纯字面量（用户在设置里直接填 '---' / 'xxx'）→ 转义并锚定为整行标记，
 *   避免 'xxx' 这类裸标记在任意位置（甚至单词中间）误切分。
 *
 * 两条路都在收尾的换行前补上 [ \t]*：`---` 后面跟一两个空格是编辑器和复制粘贴
 * 的常事，肉眼看不出来，却会让整页分页失效 —— 而且失效得很隐蔽：上一页若有
 * note:，备注会一路吃到下一个真分页符，把本该独立的一页整个吞进演讲者备注里。
 */
function normalizeSeparator(separator: string, fallback: RegExp): RegExp {
  try {
    if (!REGEX_META_RE.test(separator)) {
      return new RegExp(`\\r?\\n${escapeRegExp(separator)}${TRAILING_WS}\\r?\\n`, 'g');
    }
    // 用户自定义的正则若不以换行收尾，保持原样，不去猜他的意图
    return new RegExp(separator.replace(NEWLINE_TAIL_RE, (tail) => `${TRAILING_WS}${tail}`), 'g');
  } catch {
    return fallback;
  }
}

/** 字符下标 → 0 基行号 */
export function offsetToLine(text: string, offset: number): number {
  let line = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

/**
 * 幻灯片分页器。
 * 1. 按水平分隔符分页；
 * 2. 每块内部再按垂直分隔符分页（首块为 horizontal，其余为 vertical）；
 * 3. headingDivider 设置时，指定级别的标题另起新页；
 * 4. 过滤全空页（连续分隔符产生的空白页没有意义）。
 */
export function splitSlides(
  body: string,
  separator: string,
  verticalSeparator: string,
  headingDivider?: number[] | null,
): SplitResult {
  const horizontalRe = normalizeSeparator(separator, /\r?\n---[ \t]*\r?\n/g);

  let horizontalChunks = splitOutsideCode(body, horizontalRe);

  if (headingDivider && headingDivider.length > 0) {
    const maxLevel = Math.max(...headingDivider);
    const headingRe = new RegExp(`\\r?\\n(?=#{1,${maxLevel}}\\s)`, 'g');
    const levels = new Set(headingDivider);
    const refined: Chunk[] = [];
    for (const chunk of horizontalChunks) {
      const subs = splitOutsideCode(chunk.text, headingRe, chunk.offset);
      subs.forEach((sub, i) => {
        const headingMatch = /^(#{1,6})\s/.exec(sub.text.trimStart());
        const triggeredByHeading = i > 0;
        if (triggeredByHeading && headingMatch && !levels.has(headingMatch[1].length)) {
          // 该标题级别不在设定中：并回上一块（补回被正则吞掉的换行）
          refined[refined.length - 1].text += '\n' + sub.text;
        } else {
          refined.push(sub);
        }
      });
    }
    horizontalChunks = refined;
  }

  const verticalRe = normalizeSeparator(verticalSeparator, /\r?\nxxx[ \t]*\r?\n/g);

  const slides: RawSlide[] = [];
  for (const chunk of horizontalChunks) {
    const parts = splitOutsideCode(chunk.text, verticalRe, chunk.offset);
    parts.forEach((part, i) => {
      slides.push({
        content: part.text,
        type: i === 0 ? 'horizontal' : 'vertical',
        offset: part.offset,
      });
    });
  }

  // 过滤全空页，但至少保留一页
  const nonEmpty = slides.filter((s) => s.content.trim().length > 0);
  return { slides: nonEmpty.length > 0 ? nonEmpty : slides.slice(0, 1) };
}
