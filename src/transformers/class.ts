import type { GridElement } from '../types/grid';
import type { Transformer, TransformerResult } from './index';

/** class="..." → HTML class */
export class ClassTransformer implements Transformer {
  name = 'class';

  transform(grid: GridElement, result: TransformerResult): void {
    if (!grid.className) return;
    result.classes.push(...grid.className.split(/\s+/).filter(Boolean));
  }
}
