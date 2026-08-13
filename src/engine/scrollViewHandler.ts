/**
 * Scroll View 防护（reveal.js 6.x 自动滚动视图）。
 * 侧边栏预览面板宽度可能低于 reveal.js 的自动滚动视图切换阈值（scrollActivationWidth），
 * 导致预览误切成滚动布局。本插件默认禁用该特性：
 * buildRevealConfig 已把 frontmatter 未配置时的值置为 null（null = 关闭自动切换），
 * 这里做最后的兜底，用户显式配置阈值时则交由 reveal.js 自行处理。
 *
 * 与规划（TASK_PLAN_v2 Task 4.4）的偏差：
 * 规划提到的 `lightbox: true` 在 reveal.js 6.0.1 中不存在（已实测 RevealConfig 无该字段），
 * 故不启用灯箱配置项。
 */
import type { RevealConfig } from 'reveal.js';

export function applyScrollViewGuard(config: RevealConfig): void {
  if (config.scrollActivationWidth == null) {
    // 类型声明为 number，运行时用 null 显式关闭自动切换
    config.scrollActivationWidth = null as unknown as number;
  }
}
