import type { GridElement } from '../types/grid';
import type { Transformer, TransformerResult } from './index';

/** 内置图形 → clip-path 映射 */
export const SHAPE_CLIP_PATHS: Record<string, string> = {
  circle: 'circle(50%)',
  ellipse: 'ellipse(50% 50%)',
  triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  'triangle-down': 'polygon(0% 0%, 100% 0%, 50% 100%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
  pentagon: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
  star: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  arrow: 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)',
  chevron: 'polygon(75% 0%, 100% 50%, 75% 100%, 0% 100%, 25% 50%, 0% 0%)',
  parallelogram: 'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)',
  ribbon: 'polygon(0% 15%, 90% 15%, 100% 50%, 90% 85%, 0% 85%, 10% 50%)',
};

/** shape="hexagon" → clip-path；表外值原样透传 */
export class ShapeTransformer implements Transformer {
  name = 'shape';

  transform(grid: GridElement, result: TransformerResult): void {
    if (!grid.shape) return;
    const clipPath = SHAPE_CLIP_PATHS[grid.shape] ?? grid.shape;
    result.css.push(`clip-path: ${clipPath};`);
  }
}
