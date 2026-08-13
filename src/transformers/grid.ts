import type { GridElement } from '../types/grid';
import type { Transformer, TransformerResult } from './index';

/** dimension / position / absolute → 尺寸定位 CSS */
export class GridTransformer implements Transformer {
  name = 'grid';

  transform(grid: GridElement, result: TransformerResult): void {
    const unit = grid.absolute ? 'px' : '%';
    const [w, h] = grid.dimension;
    const [left, top] = grid.position; // parser 阶段已规范化，直接拼接

    result.css.push(
      `position: absolute;`,
      `width: ${w}${unit};`,
      `height: ${h}${unit};`,
      `left: ${left};`,
      `top: ${top};`,
    );
  }
}
