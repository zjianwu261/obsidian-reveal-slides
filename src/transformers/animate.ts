import type { GridElement } from '../types/grid';
import type { Transformer, TransformerResult } from './index';

/** animate="fade-in" → CSS 动画类（animate.css 命名约定） */
export class AnimateTransformer implements Transformer {
  name = 'animate';

  transform(grid: GridElement, result: TransformerResult): void {
    if (!grid.animate) return;
    result.classes.push('animate__animated', `animate__${grid.animate}`);
  }
}
