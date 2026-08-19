import type { FigureTheme } from './types';

/** 默认色板：与 skill 里的 Python 渲染器同源，改这里两边都要改 */
export const DEFAULT_THEME: FigureTheme = {
  brand: '#064FA1',
  soft: '#EAF1FA',
  line: '#C9D8EC',
  arrow: '#9BB4D4',
  text: '#1a1a1a',
  muted: '#555',
  accent: '#8A2B2F',
  rule: '#E5E5E5',
  font: "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  mono: 'ui-monospace, Menlo, Consolas, monospace',
};

export function mergeTheme(override?: Partial<FigureTheme>): FigureTheme {
  return override ? { ...DEFAULT_THEME, ...override } : DEFAULT_THEME;
}
