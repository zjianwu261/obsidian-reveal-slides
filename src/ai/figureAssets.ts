/**
 * 模型画的图 → 库里的 .svg 文件（纯字符串处理，可单测）。
 *
 * 手绘一张图的 SVG 有几十上百行。留在笔记里，源码翻起来全是坐标，
 * 想找「这一页到底写了什么」得先跳过一屏尖括号；而且 note: 讲稿被推到很后面，
 * 光标同步、页码换算这些按行号干活的地方也跟着变笨。
 *
 * 所以落盘时把它抽出去存成文件，笔记里只留一行 ![[…]]。
 * 文件名按「页码 + 标题」定死：同一页再画一次就覆盖同一个文件，
 * 不会在 assets 里堆出十几张没人认领的图。
 */

export interface ExtractedFigure {
  /** 库内路径，如 理论课/assets/第4章/2.4-自增和自减.svg */
  path: string;
  svg: string;
}

export interface ExtractResult {
  /** ```svg 块换成 ![[…]] 之后的正文 */
  markdown: string;
  figures: ExtractedFigure[];
}

/** ```svg 围栏（前面可能有缩进，后面可能带语言标记之外的内容） */
const SVG_FENCE = /^([ \t]*)```svg[^\n]*\n([\s\S]*?)\n?\1?```[ \t]*$/gm;

/**
 * 文件名里不能出现的字符，外加 Obsidian 链接里会惹麻烦的几个（# ^ | [ ]）。
 * 换成 '-' 而不是删掉：删掉会把「4.1 自增」黏成「4.1自增」，反而更难认。
 */
function sanitize(text: string): string {
  return text
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

/**
 * 一张图的文件名：页码打头，跟着标题，重名的挂序号。
 * 页码打头是为了在文件管理器里按名字排就是按讲课顺序排。
 */
export function figureFileName(page: string, title: string, index: number): string {
  const parts = [sanitize(page), sanitize(title)].filter(Boolean);
  const stem = parts.join('-') || 'figure';
  return index === 0 ? `${stem}.svg` : `${stem}-${index + 1}.svg`;
}

/** 这篇笔记的图放哪儿：笔记旁边的 assets/<笔记名>/ */
export function figureDir(notePath: string): string {
  const slash = notePath.lastIndexOf('/');
  const dir = slash === -1 ? '' : notePath.slice(0, slash + 1);
  const stem = notePath.slice(slash + 1).replace(/\.md$/i, '');
  return `${dir}assets/${stem}/`;
}

/**
 * 把正文里的 ```svg 块换成 ![[…]]，同时把每块 SVG 交出来等着落盘。
 *
 * 只认真的画了东西的块 —— 没有 <svg 的原样留着，那多半是模型在讲代码而不是画图。
 */
export function extractSvgFigures(
  markdown: string,
  options: { dir: string; page: string; title: string },
): ExtractResult {
  const figures: ExtractedFigure[] = [];

  const result = markdown.replace(SVG_FENCE, (block, indent: string, body: string) => {
    const svg = body.trim();
    if (!svg.includes('<svg')) return block;

    const name = figureFileName(options.page, options.title, figures.length);
    figures.push({ path: `${options.dir}${name}`, svg });
    // 只写文件名：Obsidian 按最短唯一路径解析，全路径又长又挡视线，
    // 而且笔记一挪窝，写死的那串路径就全废了
    return `${indent}![[${name}]]`;
  });

  return { markdown: result, figures };
}

/**
 * 整篇笔记里已经写着的 \`\`\`svg 一次性搬出去（迁移用）。
 *
 * 逐块往回找最近的标题当名字 —— 页码这时候算不出来（要先分页、再对行号），
 * 而标题就写在图上面几行，认得出是哪一页的图就够了。
 */
export function extractAllSvgFigures(markdown: string, dir: string): ExtractResult {
  const figures: ExtractedFigure[] = [];
  const used = new Map<string, number>();

  const result = markdown.replace(SVG_FENCE, (block, indent: string, body: string, offset: number) => {
    const svg = body.trim();
    if (!svg.includes('<svg')) return block;

    const stem = sanitize(headingBefore(markdown, offset)) || 'figure';
    const seen = used.get(stem) ?? 0;
    used.set(stem, seen + 1);
    const name = seen === 0 ? `${stem}.svg` : `${stem}-${seen + 1}.svg`;

    figures.push({ path: `${dir}${name}`, svg });
    return `${indent}![[${name}]]`;
  });

  return { markdown: result, figures };
}

/** 这个位置往回数，最近的一个 Markdown 标题 */
function headingBefore(markdown: string, offset: number): string {
  const before = markdown.slice(0, offset);
  let title = '';
  for (const match of before.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*$/gm)) title = match[1];
  return title;
}
