import { replaceOutsideCode } from '../utils/codeRanges';

export interface CssExtractResult {
  /** 移除 <style> 块后的正文 */
  body: string;
  /** 提取出的文档级 CSS */
  css: string;
}

const STYLE_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;

/**
 * 提取 <style> 块为文档级 CSS（注入模板 <head>）。
 * 支持 `:root { --brand: ... }` 变量定义，供 grid 的 style 属性 var() 引用。
 *
 * 代码块里的 <style> 是展示用的示例：既不能从正文里挖走（那页会只剩空行），
 * 更不能真的套到整个 deck 上。
 */
export function extractStyleBlocks(body: string): CssExtractResult {
  const blocks: string[] = [];
  const stripped = replaceOutsideCode(body, STYLE_RE, (whole, css) => {
    blocks.push((css ?? '').trim());
    // 用等量空行占位：正文行号要与源文件对得上，否则「光标跟随」会跳错页
    return '\n'.repeat((whole.match(/\n/g) ?? []).length);
  });
  return { body: stripped, css: blocks.join('\n\n') };
}

const CSS_FENCE_RE = /^[ \t]*```+[ \t]*css[^\n]*\n([\s\S]*?)\n[ \t]*```+[ \t]*$/gim;

/**
 * 外部样式文件 → CSS 文本。
 *
 * `.md` 文件里取 ```css 代码块与 `<style>` 块，正文一概忽略 ——
 * 好处是样式可以当普通笔记写：Obsidian 里有语法高亮、能折叠、能搜索，
 * 而 `.css` 文件默认在文件树里根本不显示。
 * 其余扩展名按纯 CSS 原样使用。
 */
export function cssFromFile(path: string, content: string): string {
  if (!/\.md$/i.test(path)) return content;

  const blocks: string[] = [];
  for (const match of content.matchAll(CSS_FENCE_RE)) blocks.push(match[1].trim());
  blocks.push(extractStyleBlocks(content).css);

  return blocks.filter(Boolean).join('\n\n');
}
