import { describe, it, expect } from 'vitest';
import { buildChartConfig, processChartBlocks } from '../../src/processors/chartProcessor';

const YAML = `type: bar
labels: [a, b, c]
series:
  - title: Series 1
    data: [1, 2, 3]
  - title: Series 2
    data: [4, 5, 6]
`;

describe('buildChartConfig', () => {
  it('normalizes obsidian-advanced-slides yaml into a Chart.js config', () => {
    const config = buildChartConfig(YAML);
    expect(config).not.toBeNull();
    expect(config!.type).toBe('bar');
    const data = config!.data as { labels: string[]; datasets: Record<string, unknown>[] };
    expect(data.labels).toEqual(['a', 'b', 'c']);
    expect(data.datasets).toHaveLength(2);
    // title → label 归一化
    expect(data.datasets[0].label).toBe('Series 1');
    expect(data.datasets[0].data).toEqual([1, 2, 3]);
    expect(data.datasets[1].label).toBe('Series 2');
  });

  it('defaults type to bar when omitted', () => {
    const config = buildChartConfig('series:\n  - data: [1]');
    expect(config!.type).toBe('bar');
  });

  it('passes options through verbatim', () => {
    const config = buildChartConfig(`${YAML}options:\n  responsive: false\n`);
    expect((config!.options as Record<string, unknown>).responsive).toBe(false);
  });

  it('returns null for invalid yaml', () => {
    expect(buildChartConfig('type: [unclosed')).toBeNull();
  });

  it('returns null when series is missing or empty', () => {
    expect(buildChartConfig('type: bar\nlabels: [a]')).toBeNull();
    expect(buildChartConfig('type: bar\nseries: []')).toBeNull();
  });

  it('returns null for non-object yaml', () => {
    expect(buildChartConfig('just a string')).toBeNull();
    expect(buildChartConfig('- 1\n- 2')).toBeNull();
  });
});

describe('processChartBlocks', () => {
  it('converts a language-chart code block into a canvas with data-chart', () => {
    const out = processChartBlocks(`<pre><code class="language-chart">${YAML}</code></pre>`);
    expect(out).toContain('class="rfo-chart"');
    expect(out).not.toContain('<pre>');

    const raw = /data-chart="([^"]*)"/.exec(out)?.[1];
    expect(raw).toBeTruthy();
    // 属性值中的引号被转义为 &quot;，还原后应为合法 JSON
    const config = JSON.parse(raw!.replace(/&quot;/g, '"'));
    expect(config.type).toBe('bar');
    expect(config.data.datasets).toHaveLength(2);
  });

  it('keeps the code block when yaml parsing fails', () => {
    const html = '<pre><code class="language-chart">type: [unclosed</code></pre>';
    const out = processChartBlocks(html);
    expect(out).toContain('<pre>');
    expect(out).not.toContain('rfo-chart');
  });

  it('leaves other language code blocks untouched', () => {
    const html = '<pre><code class="language-js">const a = 1;</code></pre>';
    expect(processChartBlocks(html)).toContain('language-js');
  });
});
