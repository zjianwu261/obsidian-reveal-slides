import type { GridElement } from '../types/grid';
import type { Transformer, TransformerResult } from './index';

/** style="..." → 内联样式透传 */
export class StyleTransformer implements Transformer {
  name = 'style';

  transform(grid: GridElement, result: TransformerResult): void {
    if (!grid.style) return;
    const style = grid.style.trim();
    result.css.push(style.endsWith(';') ? style : `${style};`);
  }
}
