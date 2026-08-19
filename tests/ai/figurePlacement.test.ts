import { describe, it, expect } from 'vitest';
import { placeFigure } from '../../src/ai/figurePlacement';

const bar = '<grid dim="100 10" pos="top" class="bar">\n## 4.1 自增\n</grid>';
const abstract = '<grid dim="92 26" pos="4 52" class="abstract">\n\n- 要点\n\n</grid>';
const embed = '![[assets/第4章/2.4-自增.png]]';

describe('placeFigure', () => {
  it('replaces whatever the fig grid was holding', () => {
    const page = `${bar}\n\n<grid dim="92 34" pos="4 14" class="fig">\n\n\`\`\`svg\n<svg />\n\`\`\`\n\n</grid>\n\n${abstract}`;
    const result = placeFigure(page, embed);
    expect(result).toContain(embed);
    expect(result).not.toContain('```svg');
    expect(result).toContain('- 要点'); // 正文一个字都没动
  });

  /* 版式说了图该多大，标签上的 dim/pos 就跟着改 */
  it('retags the grid to the box it was given', () => {
    const page = `${bar}\n\n<grid dim="92 34" pos="4 14" class="fig">\n\n old \n\n</grid>`;
    const result = placeFigure(page, embed, { x: 4, y: 15, w: 58, h: 66 });
    expect(result).toContain('dim="58 66"');
    expect(result).toContain('pos="4 15"');
  });

  /* 这一页本来没有图：在标题条后面新开一格，标题留在最上面 */
  it('opens a new grid under the title bar', () => {
    const result = placeFigure(`${bar}\n\n${abstract}`, embed);
    expect(result.indexOf('class="bar"')).toBeLessThan(result.indexOf('class="fig"'));
    expect(result.indexOf('class="fig"')).toBeLessThan(result.indexOf('class="abstract"'));
    expect(result).toContain(embed);
  });

  it('still places the figure on a page with no grids at all', () => {
    const result = placeFigure('## 标题\n\n- 要点\n', embed);
    expect(result).toContain(embed);
    expect(result).toContain('- 要点');
  });

  /* 标签上本来没写 dim/pos 的，补上而不是丢掉 class */
  it('adds dim and pos to a bare fig grid', () => {
    const result = placeFigure('<grid class="fig">\n\n old \n\n</grid>', embed);
    expect(result).toContain('dim="92 34"');
    expect(result).toContain('pos="4 14"');
    expect(result).toContain('class="fig"');
  });
});
