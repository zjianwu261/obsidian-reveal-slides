import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { renderFigure, rich, textWidth } from '../../src/figure/render';
import type { FigureSpec } from '../../src/figure/types';

const SKILL = join(__dirname, '../../.claude/skills/slide-figure/examples');

describe('helpers', () => {
  it('counts CJK as double width', () => {
    expect(textWidth('abcd', 20)).toBe(textWidth('中中', 20));
  });

  it('turns backticked runs into monospace tspans', () => {
    const html = rich('`%` 取余数', 'mono');
    expect(html).toBe('<tspan font-family="mono">%</tspan> 取余数');
  });

  it('escapes markup in the content', () => {
    expect(rich('a < b & c', 'mono')).toBe('a &lt; b &amp; c');
  });
});

describe('renderFigure', () => {
  it('refuses an unknown type instead of guessing', () => {
    expect(renderFigure({ type: 'pie' } as unknown as FigureSpec)).toBeNull();
  });

  it('lays out a bitfield with D numbers and the highlighted bit', () => {
    const svg = renderFigure({
      type: 'bitfield',
      name: 'TCON',
      bits: ['TF1', 'TR1', 'TF0', 'TR0', 'IE1', 'IT1', 'IE0', 'IT0'],
      highlight: ['IT0'],
    }) as string;

    expect(svg).toContain('>D7<');
    expect(svg).toContain('>D0<');
    // 高亮的那一位用 chip（主色描边），其余用 step
    expect((svg.match(/class="chip"/g) ?? []).length).toBe(1);
    expect((svg.match(/class="step"/g) ?? []).length).toBe(7);
  });

  it('takes a per-figure theme override', () => {
    const svg = renderFigure({
      type: 'timeline',
      nodes: [{ label: '一' }],
      theme: { brand: '#B81C22' },
    }) as string;
    expect(svg).toContain('#B81C22');
    expect(svg).not.toContain('#064FA1');
  });
});

/*
 * 同一份声明，插件里渲染（笔记实时预览）和 skill 里的 figure.py 渲染（批量出图）
 * 必须给出完全相同的 SVG —— 否则作者在预览里调好的图，命令行重渲一次就变了样。
 */
describe('parity with the python renderer', () => {
  const specs = readdirSync(SKILL).filter((f) => f.endsWith('.json'));

  it('has example specs to check', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  for (const file of specs) {
    it(`matches ${file}`, () => {
      const spec = JSON.parse(readFileSync(join(SKILL, file), 'utf8')) as FigureSpec;
      const expected = readFileSync(join(SKILL, file.replace(/\.json$/, '.svg')), 'utf8');
      expect(renderFigure(spec)?.trim()).toBe(expected.trim());
    });
  }
});
