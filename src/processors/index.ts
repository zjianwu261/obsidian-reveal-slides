import type { PluginSettings } from '../types/config';
import type { SlideDeck, SlideNote, SlidePage } from '../types/slide';
import type { GridElement, SplitElement } from '../types/grid';
import { extractFrontmatter } from './frontmatter';
import { extractStyleBlocks } from './cssProcessor';
import { splitSlides } from './slideSplitter';
import { extractNotes } from './noteProcessor';
import { parseGridTags } from './gridParser';
import { parseSplitTags } from './splitParser';
import { createDefaultRegistry, renderGridHtml, renderSplitHtml } from '../transformers';

/** 渲染函数注入：Obsidian 环境用 renderMarkdownToHtml，测试用桩 */
export type MarkdownRenderFn = (markdown: string, sourcePath: string) => Promise<string>;

export interface PipelineOptions {
  settings: PluginSettings;
  sourcePath: string;
  renderMarkdown: MarkdownRenderFn;
}

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
 * 整页渲染 → grid/split 内容二次渲染 → 占位符替换 → 组装。
 */
export class PipelineOrchestrator {
  private registry = createDefaultRegistry();

  async run(markdown: string, options: PipelineOptions): Promise<SlideDeck> {
    const { settings, sourcePath, renderMarkdown } = options;

    // 1. frontmatter
    const { frontmatter, body: rawBody } = extractFrontmatter(markdown);
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
      // 4. 逐页提取演讲者备注
      const { content: noted, notes } = extractNotes(
        slides[i].content,
        config.notesSeparator ?? settings.notesSeparator,
      );

      // 5/6. grid / split → 占位符
      const gridParsed = parseGridTags(noted);
      const splitParsed = parseSplitTags(gridParsed.html);

      // 7. 整页 Markdown 渲染（占位符为 HTML 注释，安全通过）
      let html = await renderMarkdown(splitParsed.html, sourcePath);

      // 8. grid.children / split.columns 二次渲染
      for (const grid of gridParsed.grids) {
        grid.children = await renderMarkdown(grid.children, sourcePath);
      }
      for (const split of splitParsed.splits) {
        split.columns = await Promise.all(
          split.columns.map((col) => renderMarkdown(col, sourcePath)),
        );
      }

      // 15. 占位符替换为最终 HTML
      html = this.replacePlaceholders(html, gridParsed.grids, splitParsed.splits);

      pages.push({
        index: i,
        type: slides[i].type,
        html,
        notes: await this.renderNotes(notes, renderMarkdown, sourcePath),
        attributes: {},
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

  /** 把渲染后 HTML 中的 <!--GRID_n--> / <!--SPLIT_n--> 占位符替换为最终元素 */
  private replacePlaceholders(html: string, grids: GridElement[], splits: SplitElement[]): string {
    const gridHtml = grids.map((grid) => renderGridHtml(grid, this.registry));
    const splitHtml = splits.map((split) => renderSplitHtml(split));

    // 先处理被 <p> 包裹的占位符，避免留下空段落
    let result = html.replace(
      /<p>\s*<!--GRID_(\d+)-->\s*<\/p>/g,
      (_m, i: string) => gridHtml[Number(i)] ?? '',
    );
    result = result.replace(
      /<p>\s*<!--SPLIT_(\d+)-->\s*<\/p>/g,
      (_m, i: string) => splitHtml[Number(i)] ?? '',
    );
    result = result.replace(/<!--GRID_(\d+)-->/g, (_m, i: string) => gridHtml[Number(i)] ?? '');
    result = result.replace(/<!--SPLIT_(\d+)-->/g, (_m, i: string) => splitHtml[Number(i)] ?? '');
    return result;
  }
}
