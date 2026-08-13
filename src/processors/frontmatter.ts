import { load as parseYaml } from 'js-yaml';

export interface FrontmatterResult {
  frontmatter: Record<string, unknown>;
  body: string;
  /** body 的第一行在源文件中的行号（0 基），供行号换算 */
  bodyLine: number;
}

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

/**
 * 提取 YAML frontmatter 与正文。
 * 关键: YAML 1.1 会把 `size: 16:9` 解析为六十进制数 969，
 * 这里在解析前把 size 的「数字:数字」值加引号还原为字符串。
 */
export function extractFrontmatter(markdown: string): FrontmatterResult {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) {
    return { frontmatter: {}, body: markdown, bodyLine: 0 };
  }
  const bodyLine = (match[0].match(/\n/g) ?? []).length;

  const yamlText = match[1].replace(
    /^(\s*size\s*:\s*)(?!"|')(\d+\s*:\s*\d+)\s*$/gm,
    '$1"$2"',
  );

  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed: unknown = parseYaml(yamlText);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    // 非法 YAML 时按无 frontmatter 处理，正文保留原样
    return { frontmatter: {}, body: markdown, bodyLine: 0 };
  }

  return { frontmatter, body: markdown.slice(match[0].length), bodyLine };
}
