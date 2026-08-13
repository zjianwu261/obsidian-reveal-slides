import type { GridElement } from '../types/grid';
import type { Transformer, TransformerResult } from './index';

/** dimension / position / absolute → 尺寸定位 CSS */
export class GridTransformer implements Transformer {
  name = 'grid';

  transform(grid: GridElement, result: TransformerResult): void {
    const [w, h] = grid.dimension;
    const [left, top] = grid.position; // parser 阶段已规范化，直接拼接
    const [ax, ay] = grid.anchor;

    result.css.push(
      `position: absolute;`,
      `width: ${w}%;`,
      `height: ${h}%;`,
      `left: ${left};`,
      `top: ${top};`,
    );

    // 关键字 / 负数位置需要元素自身回移，否则 left: 100% 会把元素整个推出画布
    if (ax !== '0' || ay !== '0') {
      result.css.push(`transform: translate(${ax}, ${ay});`);
    }

    // 供「显示 grid 范围」的辅助线读取（CSS 的 content: attr()），平时不影响渲染
    result.attrs['data-rfo-box'] = `${w}×${h}% @ ${left} ${top}`;
  }
}
