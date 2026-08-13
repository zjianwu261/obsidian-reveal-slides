import type { GridElement } from '../types/grid';
import type { Transformer, TransformerResult } from './index';

/** frag="1" → reveal.js fragment（数字作为 data-fragment-index） */
export class FragmentTransformer implements Transformer {
  name = 'fragment';

  transform(grid: GridElement, result: TransformerResult): void {
    if (grid.fragment === null) return;
    result.classes.push('fragment');
    if (grid.fragment !== '' && /^\d+$/.test(grid.fragment)) {
      result.attrs['data-fragment-index'] = grid.fragment;
    } else if (grid.fragment !== '') {
      // frag="fade-up" 等形式：作为 fragment 动画类
      result.classes.push(grid.fragment);
    }
  }
}
