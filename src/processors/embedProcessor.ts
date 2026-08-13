/**
 * ```slide 代码块 → 嵌入其他笔记的单页幻灯片（渲染前字符串级替换）。
 * 在分页之后、整页 Markdown 渲染之前执行（管线第 6 步之后）。
 *
 * 语法（YAML）：
 *   ```slide
 *   note: 其他笔记路径
 *   page: 2        # 可选，1-based；缺省嵌入第一页
 *   ```
 *
 * 目标笔记由 readNote 读取后跑一遍精简管线得到各页 HTML，
 * 取指定页的 html 替换代码块位置；笔记不存在 / 页码越界 / 超递归深度时替换为提示文字。
 */
import { load as parseYaml } from 'js-yaml';

export interface SlideEmbedContext {
  /** 读取 vault 内笔记内容，路径不存在返回 null；未提供时保留原代码块 */
  readNote?: (path: string) => Promise<string | null>;
  /** 将笔记 Markdown 渲染为各页 HTML（编排器注入，内部带递归深度限制）；返回 null 表示超深度 */
  renderNotePages?: (markdown: string) => Promise<string[] | null>;
}

const SLIDE_BLOCK_RE = /^[ \t]*```slide\s*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/gm;

interface EmbedDirective {
  note: string;
  page: number;
}

/** 解析 ```slide 块内的 YAML 指令；非法时返回 null */
function parseDirective(yamlText: string): EmbedDirective | null {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const note = (parsed as Record<string, unknown>).note;
  if (typeof note !== 'string' || !note.trim()) return null;

  const rawPage = (parsed as Record<string, unknown>).page;
  const page = typeof rawPage === 'number' && Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  return { note: note.trim(), page };
}

export async function processSlideEmbeds(
  content: string,
  context: SlideEmbedContext,
): Promise<string> {
  if (!content.includes('```slide')) return content;
  // 未提供笔记读取能力时不做替换，代码块原样渲染
  if (!context.readNote || !context.renderNotePages) return content;

  const matches = [...content.matchAll(SLIDE_BLOCK_RE)];
  if (matches.length === 0) return content;

  // 逐个解析替换（matchAll 结果含 index，最后统一拼接）
  const replacements = await Promise.all(
    matches.map(async (match): Promise<string> => {
      const directive = parseDirective(match[1]);
      if (!directive) return '⚠️ 幻灯片嵌入失败：```slide 指令非法（需要 note: 字段）';

      const markdown = await context.readNote!(directive.note);
      if (markdown === null) {
        return `⚠️ 幻灯片嵌入失败：找不到笔记 "${directive.note}"`;
      }

      const pages = await context.renderNotePages!(markdown);
      if (pages === null) {
        return '⚠️ 幻灯片嵌入失败：超过最大嵌入深度（可能存在循环嵌入）';
      }
      if (directive.page > pages.length) {
        return `⚠️ 幻灯片嵌入失败：笔记 "${directive.note}" 没有第 ${directive.page} 页`;
      }
      // 嵌入页已是渲染后的 HTML，MarkdownRenderer 会原样透传
      return pages[directive.page - 1];
    }),
  );

  let result = '';
  let cursor = 0;
  matches.forEach((match, i) => {
    result += content.slice(cursor, match.index);
    result += replacements[i];
    cursor = (match.index ?? 0) + match[0].length;
  });
  result += content.slice(cursor);
  return result;
}
