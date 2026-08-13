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
 */
export function extractStyleBlocks(body: string): CssExtractResult {
  const blocks: string[] = [];
  const stripped = body.replace(STYLE_RE, (_whole, css: string) => {
    blocks.push(css.trim());
    return '';
  });
  return { body: stripped, css: blocks.join('\n\n') };
}
