/**
 * ```chart 代码块 → Chart.js 配置占位 canvas（纯 DOM 操作，不依赖 obsidian）。
 * MarkdownRenderer 已把代码块渲染为 <pre><code class="language-chart">转义后的 YAML</code></pre>，
 * 这里解析 YAML 并归一化为 Chart.js 配置 JSON 塞进 data-chart 属性，
 * 真正的图表渲染由 iframe 客户端（reveal-bundle.ts 的 Chart）完成。
 *
 * YAML 格式兼容 obsidian-advanced-slides：
 *   type: bar
 *   labels: [a, b, c]
 *   series:
 *     - title: Series 1
 *       data: [1, 2, 3]
 *   options:            # 可选，原样透传给 Chart.js
 *     ...
 */
import { load as parseYaml } from 'js-yaml';

export interface ChartSeries {
  title?: string;
  data?: unknown[];
  [key: string]: unknown;
}

export interface ChartYaml {
  type?: string;
  labels?: unknown[];
  series?: ChartSeries[];
  options?: Record<string, unknown>;
}

/** YAML 文本 → Chart.js 配置对象；解析失败/缺关键字段返回 null */
export function buildChartConfig(yamlText: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const yaml = parsed as ChartYaml;
  const labels = Array.isArray(yaml.labels) ? yaml.labels : [];
  const series = Array.isArray(yaml.series) ? yaml.series : [];
  if (series.length === 0) return null;

  // series → datasets：title 归一化为 label，其余键原样透传
  const datasets = series.map((item) => {
    const { title, ...rest } = item;
    return { label: title, ...rest };
  });

  const config: Record<string, unknown> = {
    type: yaml.type ?? 'bar',
    data: { labels, datasets },
  };
  if (yaml.options && typeof yaml.options === 'object') {
    config.options = yaml.options;
  }
  return config;
}

export function processChartBlocks(html: string): string {
  if (!html.includes('language-chart')) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('pre > code[class*="language-chart"]').forEach((code) => {
    const config = buildChartConfig(code.textContent ?? '');
    // 解析失败时保留原代码块
    if (!config) return;

    const canvas = doc.createElement('canvas');
    canvas.setAttribute('class', 'rfo-chart');
    // setAttribute 序列化时自动转义引号，客户端读取时还原
    canvas.setAttribute('data-chart', JSON.stringify(config));
    code.closest('pre')?.replaceWith(canvas);
  });

  return doc.body.innerHTML;
}
