import type { PluginSettings } from '../types/config';
import type { SlideDeck, SlideNote, SlidePage } from '../types/slide';
import type { GridElement } from '../types/grid';
import { extractFrontmatter } from './frontmatter';
import { extractStyleBlocks } from './cssProcessor';
import { offsetToLine, splitSlides } from './slideSplitter';
import { extractNotes } from './noteProcessor';
import { parseGridTags } from './gridParser';
import { processImages } from './imageProcessor';
import { processSvgBlocks } from './svgProcessor';
import { processFigureBlocks } from './figureProcessor';
import { processChartBlocks } from './chartProcessor';
import { processMermaidBlocks } from './mermaidProcessor';
import { processCodeBlocks } from './codeHighlight';
import { processSlideEmbeds } from './embedProcessor';
import { processInlineMarkup } from './footnoteProcessor';
import { applyElementComments, extractElementComments } from './elementComment';
import { expandCodeLineSpecs } from './codeLineNumbers';
import { applyMath, extractMath } from './mathProcessor';
import type { MathBlock } from './mathProcessor';
import type { ElementDirective } from './elementComment';
import { createDefaultRegistry, renderGridHtml } from '../transformers';

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

/** 占位符替换的最大轮数（grid 每嵌套一层各需一轮，解析层数上限为 8） */
const MAX_PLACEHOLDER_PASSES = 20;

/** 任意 grid 占位符（不带 g 标志，仅用于探测） */
const ANY_PLACEHOLDER_RE = /⟦RFO-GRID-\d+⟧/;

/**
 * 一轮替换的匹配式，两种情形合成一条正则、一次扫描完成：
 *   1. 整段只有占位符（可能多个，中间夹 <br>）→ 连 <p> 包装一起换掉。
 *      grid 渲染出来是块级 <div>，留在 <p> 里会被浏览器踢出段落，结构错乱；
 *      Obsidian 输出的是 <p dir="auto">，属性不能写死；连续几行写的 grid 会落进同一段。
 *   2. 段落里混着正文 → 占位符原地替换，保留正文。
 * 必须一次扫描：replace 不会重扫刚插入的内容，内层占位符留到下一轮，
 * 这样它的 <p> 包装才有机会在下一轮开头被一并处理。
 */
const PLACEHOLDER_PASS_RE =
  /<p[^>]*>((?:\s|<br\s*\/?>|⟦RFO-GRID-\d+⟧)+)<\/p>|⟦RFO-GRID-(\d+)⟧/g;

const SINGLE_PLACEHOLDER_RE = /⟦RFO-GRID-\d+⟧/g;

/** frontmatter 中允许覆盖的配置键 */
const OVERRIDABLE_KEYS: (keyof PluginSettings)[] = [
  'size', 'width', 'height', 'margin', 'autoFontScale',
  'separator', 'verticalSeparator', 'headingDivider', 'notesSeparator',
  'transition', 'transitionSpeed',
  'controls', 'progress', 'slideNumber', 'center',
  'title', 'css', 'remoteCSS', 'bg',
  'enableOverview', 'scrollActivationWidth',
];

/**
 * frontmatter 的值 → 字符串数组。
 * 单个字符串、数组都接受；嵌套数组会摊平 ——
 * `css: [[course]]` 是很自然的写法（看着像 wikilink），
 * 但 YAML 会把它解析成 [["course"]]，不摊平就会被静默丢掉。
 */
function toStringList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => toStringList(item));
}

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
 * frontmatter → style 提取 → 分页 → 逐页备注 → grid 占位符 →
 * 整页渲染 → grid 内容二次渲染 → 图片/SVG/Emoji/element 注释后处理 →
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

      // 4.4 ```c [2,4-6] → 行号 / 行高亮，就地展开成 .element 指令，
      //     故须排在下一步之前
      const withLineSpecs = expandCodeLineSpecs(noted);

      // 4.45 $...$ / $$...$$ → 文本标记
      //      同样必须在渲染前抽走：Obsidian 渲染出的 MathJax CHTML 到了 iframe 里
      //      是一串空元素（字形靠它自己文档里的那张样式表补），见 mathProcessor
      const { text: withMath, maths } = extractMath(withLineSpecs);

      // 4.5 <!-- .element: --> / <!-- .slide: --> → 文本标记
      //     必须在渲染前抽走：Obsidian 会把 HTML 注释整段删掉
      const { text: marked, directives } = extractElementComments(withMath);

      // 5/6. grid → 占位符
      const gridParsed = parseGridTags(marked);
      const grids = gridParsed.grids;

      // 7. 整页 Markdown 渲染（占位符是纯文本，渲染器原样保留）
      let html = await renderMarkdown(gridParsed.html, sourcePath);

      // 8. grid.children 二次渲染
      for (const grid of grids) {
        grid.children = await renderMarkdown(grid.children, sourcePath);
      }

      // 9~14. 后处理。grid 的内容此时还在各自的字符串里（页面 html 中只有占位符），
      //       必须逐份处理，否则 grid 里的图片不会被改写、代码块不会被转换。
      const pageResult = this.postProcess(html, { serverBase, fileExists, directives, maths });
      html = pageResult.html;
      const slideAttributes = { ...pageResult.slideAttributes };

      for (const grid of grids) {
        const result = this.postProcess(grid.children, { serverBase, fileExists, directives, maths });
        grid.children = result.html;
        Object.assign(slideAttributes, result.slideAttributes);
      }

      // 15. 占位符替换为最终 HTML
      html = this.replacePlaceholders(html, grids);

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

    // css / remoteCSS 允许写成单个字符串：`css: theme/course.md` 比套一层数组顺手
    const cssList = toStringList(config.css);
    const remoteList = toStringList(config.remoteCSS);

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
   * 页面 html 与每个 grid.children 都要各跑一遍。
   */
  private postProcess(
    html: string,
    options: {
      serverBase?: string;
      fileExists?: (absolutePath: string) => boolean;
      directives?: ElementDirective[];
      maths?: MathBlock[];
    },
  ): { html: string; slideAttributes: Record<string, string> } {
    let result = processImages(html, options);
    result = processSvgBlocks(result);
    result = processFigureBlocks(result);
    result = processChartBlocks(result);
    result = processMermaidBlocks(result);
    // 余下的 <pre><code> 才是真代码块：mermaid / chart / svg 到这里已被换成各自的元素
    result = processCodeBlocks(result);
    result = processInlineMarkup(result);
    result = applyMath(result, options.maths);
    const elementResult = applyElementComments(result, options.directives);
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
   * 把渲染后 HTML 中的 ⟦RFO-GRID-n⟧ 占位符替换为最终元素。
   * 插入的 grid 自身可能还带着内层占位符（grid 套 grid），
   * 所以要多轮替换直到没有占位符为止（嵌套索引严格递增，不会循环）。
   */
  private replacePlaceholders(html: string, grids: GridElement[]): string {
    const gridHtml = grids.map((grid) => renderGridHtml(grid, this.registry));

    const htmlFor = (index: string): string => gridHtml[Number(index)] ?? '';

    let result = html;
    for (let pass = 0; pass < MAX_PLACEHOLDER_PASSES && ANY_PLACEHOLDER_RE.test(result); pass++) {
      const next = result.replace(
        PLACEHOLDER_PASS_RE,
        (whole, paragraph: string | undefined, index: string) => {
          if (paragraph === undefined) return htmlFor(index);
          // 整段都是占位符：丢掉 <p> 与 <br>，只留各占位符对应的元素
          const parts = paragraph.match(SINGLE_PLACEHOLDER_RE) ?? [];
          return parts
            .map((token) => {
              const match = /⟦RFO-GRID-(\d+)⟧/.exec(token);
              return match ? htmlFor(match[1]) : '';
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
