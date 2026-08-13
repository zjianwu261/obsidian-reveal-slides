import type { PluginSettings } from '../types/config';
import type { SlideDeck, SlideNote, SlidePage } from '../types/slide';
import type { GridElement, SplitElement } from '../types/grid';
import { extractFrontmatter } from './frontmatter';
import { extractStyleBlocks } from './cssProcessor';
import { offsetToLine, splitSlides } from './slideSplitter';
import { extractNotes } from './noteProcessor';
import { parseGridTags } from './gridParser';
import { parseSplitTags } from './splitParser';
import { processImages } from './imageProcessor';
import { processSvgBlocks } from './svgProcessor';
import { processChartBlocks } from './chartProcessor';
import { processMermaidBlocks } from './mermaidProcessor';
import { processSlideEmbeds } from './embedProcessor';
import { processInlineMarkup } from './footnoteProcessor';
import { processElementComments } from './elementComment';
import { createDefaultRegistry, renderGridHtml, renderSplitHtml } from '../transformers';
import { splitPlaceholder } from '../constants';

/** 渲染函数注入：Obsidian 环境用 renderMarkdownToHtml，测试用桩 */
export type MarkdownRenderFn = (markdown: string, sourcePath: string) => Promise<string>;

export interface PipelineOptions {
  settings: PluginSettings;
  sourcePath: string;
  renderMarkdown: MarkdownRenderFn;
  /** 预览服务器根地址（http://127.0.0.1:{port}），用于把 app:// 资源 URL 改写为 /vault 路由 */
  serverBase?: string;
  /** 判断 vault 绝对路径对应的文件是否存在（Excalidraw 同名 png 探测） */
  fileExists?: (absolutePath: string) => boolean;
  /** 读取 vault 内笔记内容（```slide 嵌入用），路径不存在返回 null */
  readNote?: (path: string) => Promise<string | null>;
  /** 内部：```slide 嵌入递归深度，外部调用勿传 */
  embedDepth?: number;
}

/** ```slide 嵌入的最大递归深度（防循环嵌入） */
const MAX_EMBED_DEPTH = 2;

/** 占位符替换的最大轮数（嵌套 grid/split 每层各需一轮，解析层数上限为 8） */
const MAX_PLACEHOLDER_PASSES = 20;

/** 任意 grid / split 占位符（不带 g 标志，仅用于探测） */
const ANY_PLACEHOLDER_RE = /⟦RFO-(?:GRID|SPLIT)-\d+⟧/;

/**
 * 一轮替换的匹配式，两种情形合成一条正则、一次扫描完成：
 *   1. 整段只有占位符（可能多个，中间夹 <br>）→ 连 <p> 包装一起换掉。
 *      grid/split 渲染出来是块级 <div>，留在 <p> 里会被浏览器踢出段落，结构错乱；
 *      Obsidian 输出的是 <p dir="auto">，属性不能写死；连续几行写的 grid 会落进同一段。
 *   2. 段落里混着正文 → 占位符原地替换，保留正文。
 * 必须一次扫描：replace 不会重扫刚插入的内容，内层占位符留到下一轮，
 * 这样它的 <p> 包装才有机会在下一轮开头被一并处理。
 */
const PLACEHOLDER_PASS_RE =
  /<p[^>]*>((?:\s|<br\s*\/?>|⟦RFO-(?:GRID|SPLIT)-\d+⟧)+)<\/p>|⟦RFO-(GRID|SPLIT)-(\d+)⟧/g;

const SINGLE_PLACEHOLDER_RE = /⟦RFO-(GRID|SPLIT)-(\d+)⟧/g;

/** frontmatter 中允许覆盖的配置键 */
const OVERRIDABLE_KEYS: (keyof PluginSettings)[] = [
  'size', 'width', 'height', 'margin', 'autoFontScale',
  'separator', 'verticalSeparator', 'headingDivider', 'notesSeparator',
  'transition', 'transitionSpeed',
  'controls', 'progress', 'slideNumber', 'center',
  'title', 'css', 'remoteCSS', 'bg',
  'enableOverview', 'scrollActivationWidth',
];

/** 合并 frontmatter 配置到设置上（仅白名单键） */
export function mergeConfig(
  settings: PluginSettings,
  frontmatter: Record<string, unknown>,
): Partial<PluginSettings> {
  const config = { ...settings } as Record<string, unknown>;
  for (const key of OVERRIDABLE_KEYS) {
    if (key in frontmatter && frontmatter[key] !== undefined) {
      config[key] = frontmatter[key];
    }
  }
  return config as Partial<PluginSettings>;
}

/**
 * 管线编排器：Markdown → SlideDeck。
 * 执行顺序见 TASK_PLAN「五、管线执行顺序」：
 * frontmatter → style 提取 → 分页 → 逐页备注 → grid/split 占位符 →
 * 整页渲染 → grid/split 内容二次渲染 → 图片/SVG/Emoji/element 注释后处理 →
 * 占位符替换 → 组装。
 */
export class PipelineOrchestrator {
  private registry = createDefaultRegistry();

  async run(markdown: string, options: PipelineOptions): Promise<SlideDeck> {
    const { settings, sourcePath, renderMarkdown, serverBase, fileExists } = options;

    // 1. frontmatter
    const { frontmatter, body: rawBody, bodyLine } = extractFrontmatter(markdown);
    const config = mergeConfig(settings, frontmatter);

    // 2. <style> 块 → 文档级 CSS
    const { body, css } = extractStyleBlocks(rawBody);

    // 3. 分页
    const { slides } = splitSlides(
      body,
      config.separator ?? settings.separator,
      config.verticalSeparator ?? settings.verticalSeparator,
      config.headingDivider ?? null,
    );

    const pages: SlidePage[] = [];
    for (let i = 0; i < slides.length; i++) {
      // 3.5 ```slide 嵌入其他笔记的单页（渲染前字符串级替换）
      // 必须在备注提取之前执行：```slide 块内的 note: 字段会被误认为演讲备注
      const embedded = await processSlideEmbeds(slides[i].content, {
        readNote: options.readNote,
        renderNotePages: (noteMarkdown) => this.renderEmbeddedNote(noteMarkdown, options),
      });

      // 4. 逐页提取演讲者备注
      const { content: noted, notes } = extractNotes(
        embedded,
        config.notesSeparator ?? settings.notesSeparator,
      );

      // 5/6. grid / split → 占位符
      const gridParsed = parseGridTags(noted);
      const splitParsed = parseSplitTags(gridParsed.html);
      const grids = gridParsed.grids;
      const splits = splitParsed.splits;

      // 6.5 grid 内部的 <split> 也要解析（占位符索引与页面级共用一张表，
      //     嵌套关系由后面的多轮占位符替换解开）
      for (const grid of grids) {
        const nested = parseSplitTags(grid.children);
        if (nested.splits.length === 0) continue;
        const offset = splits.length;
        grid.children = nested.html.replace(
          /⟦RFO-SPLIT-(\d+)⟧/g,
          (_m, n: string) => splitPlaceholder(offset + Number(n)),
        );
        splits.push(...nested.splits);
      }

      // 7. 整页 Markdown 渲染（占位符是纯文本，渲染器原样保留）
      let html = await renderMarkdown(splitParsed.html, sourcePath);

      // 8. grid.children / split.columns 二次渲染
      for (const grid of grids) {
        grid.children = await renderMarkdown(grid.children, sourcePath);
      }
      for (const split of splits) {
        split.columns = await Promise.all(
          split.columns.map((col) => renderMarkdown(col, sourcePath)),
        );
      }

      // 9~14. 后处理。grid/split 的内容此时还在各自的字符串里（页面 html 中只有占位符），
      //       必须逐份处理，否则 grid 里的图片不会被改写、代码块不会被转换。
      const pageResult = this.postProcess(html, { serverBase, fileExists });
      html = pageResult.html;
      const slideAttributes = { ...pageResult.slideAttributes };

      for (const grid of grids) {
        const result = this.postProcess(grid.children, { serverBase, fileExists });
        grid.children = result.html;
        Object.assign(slideAttributes, result.slideAttributes);
      }
      for (const split of splits) {
        split.columns = split.columns.map((col) => {
          const result = this.postProcess(col, { serverBase, fileExists });
          Object.assign(slideAttributes, result.slideAttributes);
          return result.html;
        });
      }

      // 15. 占位符替换为最终 HTML
      html = this.replacePlaceholders(html, grids, splits);

      pages.push({
        index: i,
        type: slides[i].type,
        // cssProcessor 用等量空行替换 <style>，body 行号与源文件保持一致
        sourceLine: bodyLine + offsetToLine(body, slides[i].offset),
        html,
        notes: await this.renderNotes(notes, renderMarkdown, sourcePath),
        attributes: slideAttributes,
      });
    }

    const cssList = Array.isArray(config.css) ? config.css : [];
    const remoteList = Array.isArray(config.remoteCSS) ? config.remoteCSS : [];

    return {
      title: (config.title as string | null) ?? '',
      pages,
      config,
      cssVariables: css,
      customCSS: cssList as string[],
      remoteCSS: remoteList as string[],
      bg: (config.bg as string | null) ?? undefined,
    };
  }

  /**
   * ```slide 嵌入：对目标笔记跑精简管线（复用本编排器，递归深度限制 2 层防循环嵌入），
   * 返回各页渲染后的 HTML。超过深度返回 null。
   * 注意：sourcePath 沿用父笔记，嵌入笔记内的相对链接按父笔记路径解析。
   */
  private async renderEmbeddedNote(
    markdown: string,
    options: PipelineOptions,
  ): Promise<string[] | null> {
    const depth = options.embedDepth ?? 0;
    if (depth >= MAX_EMBED_DEPTH) return null;
    const subDeck = await this.run(markdown, { ...options, embedDepth: depth + 1 });
    return subDeck.pages.map((page) => page.html);
  }

  /**
   * 渲染后 HTML 的后处理链（管线第 9~14 步）。
   * 页面 html、每个 grid.children、每个 split 栏都要各跑一遍。
   */
  private postProcess(
    html: string,
    options: { serverBase?: string; fileExists?: (absolutePath: string) => boolean },
  ): { html: string; slideAttributes: Record<string, string> } {
    let result = processImages(html, options);
    result = processSvgBlocks(result);
    result = processChartBlocks(result);
    result = processMermaidBlocks(result);
    result = processInlineMarkup(result);
    const elementResult = processElementComments(result);
    return { html: elementResult.html, slideAttributes: elementResult.slideAttributes };
  }

  /** 备注内容也按 Markdown 渲染 */
  private async renderNotes(
    notes: SlideNote[],
    renderMarkdown: MarkdownRenderFn,
    sourcePath: string,
  ): Promise<SlideNote[]> {
    return Promise.all(
      notes.map(async (note) => ({ content: await renderMarkdown(note.content, sourcePath) })),
    );
  }

  /**
   * 把渲染后 HTML 中的 ⟦RFO-GRID-n⟧ / ⟦RFO-SPLIT-n⟧ 占位符替换为最终元素。
   * 插入的 grid/split 自身可能还带着内层占位符（grid 里放 split、split 里放 grid），
   * 所以要多轮替换直到没有占位符为止（嵌套索引严格递增，不会循环）。
   */
  private replacePlaceholders(html: string, grids: GridElement[], splits: SplitElement[]): string {
    const gridHtml = grids.map((grid) => renderGridHtml(grid, this.registry));
    const splitHtml = splits.map((split) => renderSplitHtml(split));

    const htmlFor = (kind: string, index: string): string =>
      (kind === 'GRID' ? gridHtml[Number(index)] : splitHtml[Number(index)]) ?? '';

    let result = html;
    for (let pass = 0; pass < MAX_PLACEHOLDER_PASSES && ANY_PLACEHOLDER_RE.test(result); pass++) {
      const next = result.replace(
        PLACEHOLDER_PASS_RE,
        (whole, paragraph: string | undefined, kind: string, index: string) => {
          if (paragraph === undefined) return htmlFor(kind, index);
          // 整段都是占位符：丢掉 <p> 与 <br>，只留各占位符对应的元素
          const parts = paragraph.match(SINGLE_PLACEHOLDER_RE) ?? [];
          return parts
            .map((token) => {
              const match = /⟦RFO-(GRID|SPLIT)-(\d+)⟧/.exec(token);
              return match ? htmlFor(match[1], match[2]) : '';
            })
            .join('\n') || whole;
        },
      );
      if (next === result) break; // 剩下的是无对应元素的占位符，再转也不会变
      result = next;
    }
    return result;
  }
}
