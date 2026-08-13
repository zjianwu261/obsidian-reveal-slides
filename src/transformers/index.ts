import type { GridElement, SplitElement } from '../types/grid';
import { escapeHtml } from '../utils/dom';
import { GridTransformer } from './grid';
import { ShapeTransformer } from './shape';
import { StyleTransformer } from './style';
import { ClassTransformer } from './class';
import { FragmentTransformer } from './fragment';
import { AnimateTransformer } from './animate';

/** 转换器输出：CSS 片段、HTML class、HTML 属性 */
export interface TransformerResult {
  css: string[];
  classes: string[];
  attrs: Record<string, string>;
}

export interface Transformer {
  name: string;
  transform(grid: GridElement, result: TransformerResult): void;
}

/** 转换器注册表：按固定顺序执行所有转换器 */
export class TransformerRegistry {
  private transformers: Transformer[] = [];

  register(transformer: Transformer): this {
    this.transformers.push(transformer);
    return this;
  }

  run(grid: GridElement): TransformerResult {
    const result: TransformerResult = { css: [], classes: [], attrs: {} };
    for (const transformer of this.transformers) {
      transformer.transform(grid, result);
    }
    return result;
  }
}

export function createDefaultRegistry(): TransformerRegistry {
  return new TransformerRegistry()
    .register(new GridTransformer())
    .register(new ShapeTransformer())
    .register(new StyleTransformer())
    .register(new ClassTransformer())
    .register(new FragmentTransformer())
    .register(new AnimateTransformer());
}

/** GridElement → 最终 <div> HTML（children 须为已渲染的 HTML） */
export function renderGridHtml(grid: GridElement, registry = createDefaultRegistry()): string {
  const result = registry.run(grid);

  const style = result.css.filter(Boolean).join(' ');
  const classes = ['grid', ...result.classes].filter(Boolean).join(' ');
  const attrs = Object.entries(result.attrs)
    .map(([key, value]) => ` ${escapeHtml(key)}="${escapeHtml(value)}"`)
    .join('');

  return `<div class="${escapeHtml(classes)}" style="${escapeHtml(style)}"${attrs}>${grid.children}</div>`;
}

/** SplitElement → 最终 flex 分栏 HTML（columns 须为已渲染的 HTML） */
export function renderSplitHtml(split: SplitElement): string {
  const styleParts = ['display: flex', 'width: 100%'];
  if (split.gap > 0) styleParts.push(`gap: ${split.gap}em`);
  if (split.wrap !== null) styleParts.push('flex-wrap: wrap');

  const classes = ['split'];
  if (split.wrap !== null) classes.push('split-wrap');

  const weights = split.even
    ? split.columns.map(() => 1)
    : split.columns.map((_, i) => (i === 0 ? split.left : i === 1 ? split.right : 1));

  const columns = split.columns
    .map((col, i) => {
      const colClasses = ['split-column'];
      if (split.noMargin) colClasses.push('split-no-margin');
      return `<div class="${colClasses.join(' ')}" style="flex: ${weights[i]}; min-width: 0;">${col}</div>`;
    })
    .join('\n');

  return `<div class="${classes.join(' ')}" style="${styleParts.join('; ')};">\n${columns}\n</div>`;
}
