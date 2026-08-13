import type { SlideNote } from '../types/slide';
import { findCodeRanges, isInsideCode } from '../utils/codeRanges';

export interface NoteExtractResult {
  content: string;
  notes: SlideNote[];
}

/**
 * 提取单页末尾的演讲者备注。
 * 从第一个以 notesSeparator（默认 "note:"）开头的行起，到页尾均为备注。
 * 必须在分页之后逐页执行，避免跨页边界。
 *
 * 代码块里的 `note:` 不算分隔符：YAML / 字典示例里这行太常见，
 * 一旦误判，示例会从中间被截断，后半段连同收尾的 ``` 一起被搬进备注。
 */
export function extractNotes(content: string, notesSeparator: string): NoteExtractResult {
  const sep = notesSeparator || 'note:';
  const lines = content.split('\n');

  const ranges = findCodeRanges(content);
  let startIndex = -1;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const indent = lines[i].length - lines[i].trimStart().length;
    if (lines[i].trimStart().startsWith(sep) && !isInsideCode(offset + indent, ranges)) {
      startIndex = i;
      break;
    }
    offset += lines[i].length + 1; // +1 为被 split 吃掉的 \n
  }

  if (startIndex === -1) {
    return { content, notes: [] };
  }

  const noteLines = lines.slice(startIndex);
  // 首行去掉分隔符前缀
  noteLines[0] = noteLines[0].trimStart().slice(sep.length).trimStart();

  const noteContent = noteLines.join('\n').trim();
  const slideContent = lines.slice(0, startIndex).join('\n').trimEnd();

  return {
    content: slideContent,
    notes: noteContent ? [{ content: noteContent }] : [],
  };
}
