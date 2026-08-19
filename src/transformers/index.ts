import type { GridElement } from '../types/grid';
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
