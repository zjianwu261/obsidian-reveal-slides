import { describe, it, expect } from 'vitest';
import {
  cssColor,
  cssFraction,
  gridBox,
  notesToLines,
  parseSlideHtml,
} from '../../src/export/slideOutline';
import type { OutlineBlock, OutlineRegion } from '../../src/export/slideOutline';

const ROOT = { x: 0, y: 0, w: 1, h: 1 };
const OPTIONS = { canvas: ROOT, content: ROOT, center: true, placeholders: true };

function parse(html: string, overrides: Partial<typeof OPTIONS> = {}): OutlineRegion[] {
  return parseSlideHtml(html, { ...OPTIONS, ...overrides });
}

/** 取所有区域里的第一个文本块 */
function firstText(regions: OutlineRegion[]): Extract<OutlineBlock, { kind: 'text' }> {
  for (const region of regions) {
    for (const block of region.blocks) {
      if (block.kind === 'text') return block;
    }
  }
  throw new Error('no text block');
}

function plain(block: Extract<OutlineBlock, { kind: 'text' }>): string[] {
  return block.paragraphs.map((para) => para.runs.map((run) => run.text).join(''));
}

describe('cssFraction', () => {
  it('parses percentages and the calc() form gridParser emits for negative offsets', () => {
    expect(cssFraction('40%')).toBe(0.4);
    expect(cssFraction('calc(100% - 6%)')).toBeCloseTo(0.94);
    expect(cssFraction('-50%')).toBe(-0.5);
    expect(cssFraction('0')).toBe(0);
  });

  it('returns null for lengths it cannot resolve without layout', () => {
    expect(cssFraction('12px')).toBeNull();
    expect(cssFraction(undefined)).toBeNull();
  });
});

describe('cssColor', () => {
  it('normalizes hex, shorthand hex, rgb() and named colors to RRGGBB', () => {
    expect(cssColor('#1a2b3c')).toBe('1A2B3C');
    expect(cssColor('#f0a')).toBe('FF00AA');
    expect(cssColor('rgb(255, 128, 0)')).toBe('FF8000');
    expect(cssColor('rgba(0, 0, 0, 0.5)')).toBe('000000');
    expect(cssColor('white')).toBe('FFFFFF');
  });

  it('picks the color token out of a background shorthand', () => {
    expect(cssColor('#fff url(a.png) no-repeat')).toBe('FFFFFF');
  });

  it('gives up rather than guessing on gradients', () => {
    expect(cssColor('linear-gradient(red, blue)')).toBeNull();
    expect(cssColor(undefined)).toBeNull();
  });
});

describe('gridBox', () => {
  it('maps width/height/left/top percentages onto the parent box', () => {
    const box = gridBox(ROOT, { width: '40%', height: '30%', left: '10%', top: '20%' });
    expect(box).toEqual({ x: 0.1, y: 0.2, w: 0.4, h: 0.3 });
  });

  it('applies the translate() anchor keyword grids use to hug an edge', () => {
    // pos="center" → left/top 50% 再回移自身的一半
    const box = gridBox(ROOT, {
      width: '50%',
      height: '50%',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    });
    expect(box).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });

  it('composes against a parent box so nested grids land in the right place', () => {
    const parent = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    const box = gridBox(parent, { width: '50%', height: '50%', left: '50%', top: '0%' });
    expect(box).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.2 });
  });
});

describe('parseSlideHtml', () => {
  it('puts plain content in a single region covering the safe area', () => {
    const content = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    const regions = parse('<h2>标题</h2><p>正文</p>', { content });
    expect(regions).toHaveLength(1);
    expect(regions[0].box).toEqual(content);
    expect(plain(firstText(regions))).toEqual(['标题', '正文']);
  });

  // <grid> 的百分比是相对整块画布写的；拿安全区当基准会让每一页都被边距二次缩放
  it('positions grids against the full canvas, not the content safe area', () => {
    const html =
      '<div class="grid" style="position: absolute; width: 100%; height: 100%; left: 0%; top: 0%;">' +
      '<p>满版</p></div>';
    const regions = parse(html, { content: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 } });
    const grid = regions.find((region) => region.blocks.length > 0)!;
    expect(grid.box).toEqual(ROOT);
  });


  it('scales heading sizes the way canvas.scss does', () => {
    const block = firstText(parse('<h1>大</h1><h2>中</h2><h3>小</h3><p>正文</p>'));
    expect(block.paragraphs.map((para) => para.size)).toEqual([2, 1.6, 1.25, 1]);
    expect(block.paragraphs[0].runs[0].bold).toBe(true);
  });

  it('gives every <grid> its own region with absolute coordinates', () => {
    const html =
      '<div class="grid" style="position: absolute; width: 40%; height: 30%; left: 10%; top: 20%;">' +
      '<p>左</p></div>' +
      '<div class="grid" style="position: absolute; width: 40%; height: 30%; left: 55%; top: 20%;">' +
      '<p>右</p></div>';
    const regions = parse(html);

    expect(regions).toHaveLength(2);
    expect(regions[0].box.x).toBeCloseTo(0.1);
    expect(regions[1].box.x).toBeCloseTo(0.55);
    expect(plain(regions[0].blocks[0] as never)).toEqual(['左']);
  });

  it('resolves nested grids against their parent region', () => {
    const html =
      '<div class="grid" style="position: absolute; width: 50%; height: 50%; left: 50%; top: 0%;">' +
      '<div class="grid" style="position: absolute; width: 50%; height: 100%; left: 0%; top: 0%;">' +
      '<p>内</p></div></div>';
    const regions = parse(html);
    const inner = regions[regions.length - 1];
    expect(inner.box.x).toBeCloseTo(0.5);
    expect(inner.box.w).toBeCloseTo(0.25);
  });


  it('carries inline font-size and color from the grid down to the runs', () => {
    const html =
      '<div class="grid" style="position: absolute; width: 100%; height: 100%; left: 0%; top: 0%;' +
      ' font-size: 2em; color: #ff0000; background-color: #eeeeee;"><p>大红字</p></div>';
    const regions = parse(html);
    const region = regions.find((r) => r.blocks.length > 0)!;
    const block = region.blocks[0] as Extract<OutlineBlock, { kind: 'text' }>;

    expect(region.fill).toBe('EEEEEE');
    expect(block.paragraphs[0].size).toBe(2);
    expect(block.paragraphs[0].runs[0].color).toBe('FF0000');
  });

  it('maps <grid shape> clip-paths back to PowerPoint preset geometry', () => {
    const html =
      '<div class="grid" style="position: absolute; width: 20%; height: 20%; left: 0%; top: 0%;' +
      ' clip-path: circle(50%);"><p>圆</p></div>';
    expect(parse(html).find((r) => r.geometry)?.geometry).toBe('ellipse');
  });

  it('flattens nested lists into paragraphs with an indent level', () => {
    const html = '<ul><li>一<ul><li>一之一</li></ul></li><li>二</li></ul>';
    const block = firstText(parse(html));
    expect(block.paragraphs.map((para) => [para.runs[0].text, para.indent])).toEqual([
      ['一', 0],
      ['一之一', 1],
      ['二', 0],
    ]);
  });

  it('marks ordered lists so they get auto numbering', () => {
    const block = firstText(parse('<ol><li>甲</li><li>乙</li></ol>'));
    expect(block.paragraphs.every((para) => para.ordered)).toBe(true);
  });

  it('keeps inline emphasis, code and links as run-level styling', () => {
    const html = '<p><strong>粗</strong><em>斜</em><code>码</code><a href="https://x.dev">链</a></p>';
    const runs = firstText(parse(html)).paragraphs[0].runs;
    expect(runs.map((run) => run.text)).toEqual(['粗', '斜', '码', '链']);
    expect(runs[0].bold).toBe(true);
    expect(runs[1].italic).toBe(true);
    expect(runs[2].mono).toBe(true);
    expect(runs[3].link).toBe('https://x.dev');
  });

  it('turns a code block into one dark mono block, one paragraph per line', () => {
    const html = '<pre><code class="language-js">const a = 1;\n  const b = 2;\n</code></pre>';
    const block = firstText(parse(html));
    expect(block.fill).toBe('2D2D2D');
    expect(block.mono).toBe(true);
    expect(plain(block)).toEqual(['const a = 1;', '  const b = 2;']);
  });

  it('reads tables into a cell matrix and flags the header row', () => {
    const html =
      '<table><thead><tr><th>名</th><th>值</th></tr></thead>' +
      '<tbody><tr><td>甲</td><td>1</td></tr></tbody></table>';
    const table = parse(html)[0].blocks[0];
    expect(table.kind).toBe('table');
    if (table.kind !== 'table') return;
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0][0].header).toBe(true);
    expect(table.rows[1].map((cell) => cell.runs[0].text)).toEqual(['甲', '1']);
  });

  it('keeps images with their explicit size and drops the ones without a src', () => {
    const html = '<p><img src="http://127.0.0.1:3000/vault/a.png" alt="图" width="800"></p><img alt="x">';
    const images = parse(html)[0].blocks.filter((block) => block.kind === 'image');
    expect(images).toHaveLength(1);
    if (images[0].kind !== 'image') return;
    expect(images[0].src).toBe('http://127.0.0.1:3000/vault/a.png');
    expect(images[0].width).toBe(800);
    expect(images[0].height).toBeNull();
  });

  it('leaves a note where mermaid / charts / video used to be', () => {
    const html =
      '<div class="rfo-mermaid">graph TD;</div><canvas class="rfo-chart" data-chart="{}"></canvas>' +
      '<video controls src="a.mp4"></video>';
    const labels = parse(html)[0]
      .blocks.filter((block) => block.kind === 'note')
      .map((block) => (block.kind === 'note' ? block.label : ''));
    expect(labels).toHaveLength(3);
    expect(labels[0]).toContain('Mermaid');
  });

  it('drops those blocks entirely when placeholders are off', () => {
    const html = '<div class="rfo-mermaid">graph TD;</div>';
    expect(parse(html, { placeholders: false })).toHaveLength(0);
  });

  it('does not leak speaker notes into the slide body', () => {
    const regions = parse('<p>正文</p><aside class="notes"><p>只给讲者看</p></aside>');
    expect(plain(firstText(regions))).toEqual(['正文']);
  });

  it('renders an Obsidian callout as an indented, filled text block', () => {
    const html =
      '<div class="callout" data-callout="tip"><div class="callout-title">提示</div>' +
      '<div class="callout-content"><p>记得保存</p></div></div>';
    const block = firstText(parse(html));
    expect(block.fill).toBe('F2F2F2');
    expect(plain(block)).toEqual(['提示', '记得保存']);
    expect(block.paragraphs.every((para) => para.quoted)).toBe(true);
  });

  it('collapses HTML whitespace but keeps indentation inside code blocks', () => {
    expect(plain(firstText(parse('<p>a\n   b</p>')))).toEqual(['a b']);
    expect(plain(firstText(parse('<pre><code>  x</code></pre>')))).toEqual(['  x']);
  });
});

describe('notesToLines', () => {
  it('turns each block element into one line', () => {
    expect(notesToLines('<p>先讲背景</p><p>再讲结论</p>')).toEqual(['先讲背景', '再讲结论']);
  });

  it('keeps list items, including nested ones', () => {
    const lines = notesToLines('<ul><li>一<ul><li>一之一</li></ul></li><li>二</li></ul>');
    expect(lines).toContain('一之一');
    expect(lines).toContain('二');
  });

  it('does not repeat a paragraph that sits inside a list item or quote', () => {
    expect(notesToLines('<ul><li><p>只此一次</p></li></ul>')).toEqual(['只此一次']);
    expect(notesToLines('<blockquote><p>引用</p></blockquote>')).toEqual(['引用']);
  });

  it('collapses whitespace and drops empty blocks', () => {
    expect(notesToLines('<p>  a\n  b  </p><p>   </p>')).toEqual(['a b']);
  });

  it('falls back to the raw text when there are no block elements', () => {
    expect(notesToLines('裸文本 <strong>加粗</strong>')).toEqual(['裸文本 加粗']);
    expect(notesToLines('')).toEqual([]);
  });
});
