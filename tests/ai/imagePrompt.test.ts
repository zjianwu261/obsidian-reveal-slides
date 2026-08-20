import { describe, it, expect } from 'vitest';
import {
  FIGURE_DESCRIBE_SYSTEM,
  FIGURE_TRANSLATE_SYSTEM,
  IMAGE_STYLES,
  buildFigureDescribeRequest,
  cleanImagePrompt,
  extractNotes,
  extractTitle,
  imageStyleById,
  shapeForBox,
  withStyle,
} from '../../src/ai/imagePrompt';

describe('FIGURE_DESCRIBE_SYSTEM', () => {
  /* 生成模型写不好字，中文尤其糊成一团 —— 每一套画风都得禁掉 */
  it('forbids text inside the picture', () => {
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('图里不许有文字');
    for (const style of IMAGE_STYLES) expect(withStyle('x', style.id)).toContain('no text');
  });

  /* 风格由插件定死，模型那 80 个词全花在内容上 */
  it('tells the model not to spend words on style', () => {
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('不用写风格');
  });

  /* 题目划范围、讲稿给内容 —— 讲稿常常从上一页的话头讲起 */
  it('tells the model what each part is for', () => {
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('题目划定范围');
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('note: 讲稿决定内容');
  });

  /* 讲稿罗列五样东西时各画一格，出来的是图例不是讲解 */
  it('says where to look for the one thing worth drawing', () => {
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('最容易混淆');
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('不要五样各画一格');
  });

  /* 抽象名词只会换来一堆发光的电路和齿轮 */
  it('bans the vague words that produce stock art', () => {
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('体现自增的概念');
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('发光的电路和齿轮');
  });
});

describe('extractNotes', () => {
  it('takes everything after the notes marker', () => {
    expect(extractNotes('## 标题\n\nnote: 第一句\n第二句')).toBe('第一句\n第二句');
  });

  it('follows the marker you configured', () => {
    expect(extractNotes('正文\n\n备注：讲这个', '备注：')).toBe('讲这个');
  });

  it('comes back empty when the page has no notes', () => {
    expect(extractNotes('## 标题\n\n- 要点')).toBe('');
  });
});

describe('extractTitle', () => {
  it('takes the heading out of the title bar', () => {
    const page = '<grid dim="100 10" pos="top" class="bar">\n## 4.1 自增和自减\n</grid>';
    expect(extractTitle(page)).toBe('4.1 自增和自减');
  });

  it('comes back empty when the page has no heading', () => {
    expect(extractTitle('- 只有要点')).toBe('');
  });
});

describe('buildFigureDescribeRequest', () => {
  /* 题目划范围、讲稿给内容：两样都得摆在整页源码前面，不然模型只扫一眼就动笔 */
  it('leads with the title and the speaker notes', () => {
    const text = buildFigureDescribeRequest({
      pageSource: '## 4.1 自增和自减\n\n- 要点\n\nnote: 先取旧值，回头才加一',
      request: '配张图',
    });
    expect(text.indexOf('4.1 自增和自减')).toBeLessThan(text.indexOf('先取旧值'));
    expect(text.indexOf('先取旧值，回头才加一')).toBeLessThan(text.indexOf('完整源码'));
    expect(text).toContain('配张图');
  });

  it('says so when the page has no notes to work from', () => {
    const text = buildFigureDescribeRequest({ pageSource: '## 标题\n\n- 要点', request: '配张图' });
    expect(text).toContain('没有讲稿');
  });
});

describe('cleanImagePrompt', () => {
  /* 引号会被当成画面内容的一部分 */
  it('strips quotes the model wrapped around it', () => {
    expect(cleanImagePrompt('"a flat vector counter scene"')).toBe('a flat vector counter scene');
  });

  it('drops a lead-in line', () => {
    expect(cleanImagePrompt('Prompt: a counter scene')).toBe('a counter scene');
  });

  it('drops a code fence', () => {
    expect(cleanImagePrompt('```\na counter scene\n```')).toBe('a counter scene');
  });

  it('leaves a clean prompt untouched', () => {
    expect(cleanImagePrompt('a counter scene, no text')).toBe('a counter scene, no text');
  });
});

describe('shapeForBox', () => {
  /* 图占满整行就是宽扁的，跟正文并排就偏方 */
  it('reads the shape off the grid it has to fit', () => {
    expect(shapeForBox(92, 34)).toBe('landscape');
    expect(shapeForBox(58, 66)).toBe('square');
    expect(shapeForBox(36, 66)).toBe('portrait');
  });

  it('does not divide by a zero-height box', () => {
    expect(shapeForBox(92, 0)).toBe('landscape');
  });
});

describe('IMAGE_STYLES', () => {
  /* 每页自己想风格＝每页抽一次卡，一本课件看着像好几个人拼的 */
  it('pins the look down instead of leaving it to chance', () => {
    expect(IMAGE_STYLES[0].id).toBe('lecture');
    expect(withStyle('x')).toContain('flat vector illustration');
  });

  it('gives every style a unique id', () => {
    const ids = IMAGE_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /* 挑了张不存在的画风（设置手改坏了）也别把生图卡住 */
  it('falls back to the first style when asked for one that is gone', () => {
    expect(imageStyleById('nope').id).toBe('lecture');
  });
});

describe('withStyle', () => {
  it('puts the chosen style behind whatever was written', () => {
    const full = withStyle('a hand pouring a value into a box', 'whiteboard');
    expect(full.startsWith('a hand pouring a value into a box.')).toBe(true);
    expect(full).toContain('whiteboard marker sketch');
  });

  it('does not double up the full stop', () => {
    expect(withStyle('a box.')).not.toContain('..');
  });
});

describe('FIGURE_TRANSLATE_SYSTEM', () => {
  /* 老师删掉的东西不能被翻译这一步偷偷加回去 */
  it('translates without inventing', () => {
    expect(FIGURE_TRANSLATE_SYSTEM).toContain('只翻译，不创作');
  });
});
