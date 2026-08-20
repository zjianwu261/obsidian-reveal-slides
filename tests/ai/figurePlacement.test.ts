import { describe, it, expect } from 'vitest';
import { placeFigure, readFigureBox } from '../../src/ai/figurePlacement';

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

  /* 那是你自己排的版，插件没有理由替你改 */
  it('leaves the grid you wrote exactly as you wrote it', () => {
    const page = `${bar}\n\n<grid dim="92 34" pos="4 14" class="fig">\n\n old \n\n</grid>`;
    const result = placeFigure(page, embed, { x: 4, y: 15, w: 58, h: 66 });
    expect(result).toContain('dim="92 34"');
    expect(result).toContain('pos="4 14"');
    expect(result).not.toContain('dim="58 66"');
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

  /* 标签上没写 dim/pos 是你自己的选择（比如靠 CSS 排），照样别动 */
  it('does not sneak attributes into a bare fig grid', () => {
    const result = placeFigure('<grid class="fig">\n\n old \n\n</grid>', embed);
    expect(result).toBe('<grid class="fig">\n\n' + embed + '\n\n</grid>');
  });
});

describe('readFigureBox', () => {
  /* 画幅从你写好的格子里拿，版式条不作数 */
  it('reads the size you wrote', () => {
    const page = `${bar}\n\n<grid dim="58 66" pos="4 15" class="fig">\n\n old \n\n</grid>`;
    expect(readFigureBox(page)).toEqual({ w: 58, h: 66, x: 4, y: 15 });
  });

  /* pos 写成 top / center 这类词时，画幅只看宽高 */
  it('still reads the size when pos is a word', () => {
    expect(readFigureBox('<grid dim="92 34" pos="top" class="fig">x</grid>')).toEqual({
      w: 92,
      h: 34,
      x: 0,
      y: 0,
    });
  });

  it('has nothing to say about a page with no figure grid', () => {
    expect(readFigureBox(bar)).toBeNull();
  });

  it('has nothing to say when dim is missing', () => {
    expect(readFigureBox('<grid class="fig">x</grid>')).toBeNull();
  });
});
