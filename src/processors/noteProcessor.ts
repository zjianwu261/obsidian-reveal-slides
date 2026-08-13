import type { SlideNote } from '../types/slide';

export interface NoteExtractResult {
  content: string;
  notes: SlideNote[];
}

/**
 * 提取单页末尾的演讲者备注。
 * 从第一个以 notesSeparator（默认 "note:"）开头的行起，到页尾均为备注。
 * 必须在分页之后逐页执行，避免跨页边界。
 */
export function extractNotes(content: string, notesSeparator: string): NoteExtractResult {
  const sep = notesSeparator || 'note:';
  const lines = content.split('\n');

  const startIndex = lines.findIndex((line) => line.trimStart().startsWith(sep));
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
