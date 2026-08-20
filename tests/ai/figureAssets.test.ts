import { describe, it, expect } from 'vitest';
import {
  extractAllSvgFigures,
  extractSvgFigures,
  figureDir,
  figureFileName,
} from '../../src/ai/figureAssets';

const OPTIONS = { dir: '理论课/assets/第4章/', page: '2.4', title: '自增和自减运算符' };

describe('figureDir', () => {
  it('puts the figures next to the note', () => {
    expect(figureDir('理论课/第4章.md')).toBe('理论课/assets/第4章/');
  });

  it('handles a note at the vault root', () => {
    expect(figureDir('第4章.md')).toBe('assets/第4章/');
  });
});

describe('figureFileName', () => {
  /* 页码打头：文件管理器里按名字排就是按讲课顺序排 */
  it('leads with the page number', () => {
    expect(figureFileName('2.4', '自增和自减', 0)).toBe('2.4-自增和自减.svg');
  });

  it('numbers the second figure on a page', () => {
    expect(figureFileName('2.4', '自增和自减', 1)).toBe('2.4-自增和自减-2.svg');
  });

  /* 文件名里不能有这些，链接里也会惹麻烦 */
  it('scrubs characters a path or a wikilink cannot hold', () => {
    expect(figureFileName('2.4', 'a/b:c|d[e]', 0)).toBe('2.4-a-b-c-d-e.svg');
  });

  it('still names a page with no title', () => {
    expect(figureFileName('2.4', '', 0)).toBe('2.4.svg');
    expect(figureFileName('', '', 0)).toBe('figure.svg');
  });
});

describe('extractSvgFigures', () => {
  const page = [
    '<grid dim="92 34" pos="4 14" class="fig">',
    '',
    '```svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300"><rect /></svg>',
    '```',
    '',
    '</grid>',
  ].join('\n');

  /* 链接只写文件名：Obsidian 按最短唯一路径解析，笔记挪了窝也不会断 */
  it('leaves a short link where the code block was', () => {
    const result = extractSvgFigures(page, OPTIONS);
    expect(result.markdown).toContain('![[2.4-自增和自减运算符.svg]]');
    expect(result.markdown).not.toContain('![[理论课/');
    expect(result.markdown).not.toContain('```svg');
    expect(result.markdown).toContain('<grid dim="92 34" pos="4 14" class="fig">');
  });

  it('hands back the svg to be written', () => {
    const { figures } = extractSvgFigures(page, OPTIONS);
    expect(figures).toHaveLength(1);
    expect(figures[0].path).toBe('理论课/assets/第4章/2.4-自增和自减运算符.svg');
    expect(figures[0].svg.startsWith('<svg')).toBe(true);
  });

  it('numbers a second figure on the same page', () => {
    const { figures } = extractSvgFigures(`${page}\n\n${page}`, OPTIONS);
    expect(figures.map((f) => f.path)).toEqual([
      '理论课/assets/第4章/2.4-自增和自减运算符.svg',
      '理论课/assets/第4章/2.4-自增和自减运算符-2.svg',
    ]);
  });

  /* 没画东西的块多半是在讲代码，别当成图搬走 */
  it('leaves a block that draws nothing alone', () => {
    const talking = '```svg\n这一段讲的是 svg 怎么写\n```';
    const result = extractSvgFigures(talking, OPTIONS);
    expect(result.markdown).toBe(talking);
    expect(result.figures).toEqual([]);
  });

  /* figure 声明只有几行，本来就该留在笔记里改 */
  it('leaves ```figure declarations in the note', () => {
    const spec = '```figure\n{"type":"flow","rows":[]}\n```';
    expect(extractSvgFigures(spec, OPTIONS).markdown).toBe(spec);
  });

  it('does nothing to a page without figures', () => {
    expect(extractSvgFigures('## 标题\n\n- 要点', OPTIONS).figures).toEqual([]);
  });
});

describe('extractAllSvgFigures', () => {
  const note = [
    '## 4.1 自增和自减',
    '',
    '```svg',
    '<svg viewBox="0 0 900 300"><rect /></svg>',
    '```',
    '',
    '---',
    '',
    '## 4.2 循环',
    '',
    '```svg',
    '<svg viewBox="0 0 900 300"><circle /></svg>',
    '```',
  ].join('\n');

  /* 整篇搬迁时算不出页码（要先分页再对行号），标题就在图上面几行，够认了 */
  it('names each figure after the heading above it', () => {
    const { figures } = extractAllSvgFigures(note, 'assets/第4章/');
    expect(figures.map((f) => f.path)).toEqual([
      'assets/第4章/4.1-自增和自减.svg',
      'assets/第4章/4.2-循环.svg',
    ]);
  });

  it('numbers a second figure under the same heading', () => {
    const twice = note.split('---')[0].repeat(2);
    const { figures } = extractAllSvgFigures(twice, 'assets/x/');
    expect(figures.map((f) => f.path)).toEqual([
      'assets/x/4.1-自增和自减.svg',
      'assets/x/4.1-自增和自减-2.svg',
    ]);
  });

  it('leaves links behind and takes the code away', () => {
    const { markdown } = extractAllSvgFigures(note, 'assets/第4章/');
    expect(markdown).toContain('![[4.1-自增和自减.svg]]');
    expect(markdown).not.toContain('```svg');
  });

  it('finds nothing in a note without figures', () => {
    expect(extractAllSvgFigures('## 标题\n\n- 要点', 'assets/x/').figures).toEqual([]);
  });
});
