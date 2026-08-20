import { describe, it, expect } from 'vitest';
import {
  FIGURE_DESCRIBE_SYSTEM,
  FIGURE_TRANSLATE_SYSTEM,
  IMAGE_STYLES,
  buildFigureDescribeRequest,
  buildFigureTranslateRequest,
  cleanImagePrompt,
  composeImagePrompt,
  extractNotes,
  extractTitle,
  imageStyleById,
  parseFigureTranslation,
  shapeForBox,
  withStyle,
} from '../../src/ai/imagePrompt';

describe('FIGURE_DESCRIBE_SYSTEM', () => {
  /* 生成模型写不好字，中文尤其糊成一团 —— 每一套画风都得禁掉 */
  it('forbids text inside the picture', () => {
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('不要出现数字、字母');
    for (const style of IMAGE_STYLES) expect(withStyle('x', style.id)).toContain('no text');
  });

  /* 生成模型数不准个数，三个以上必错 —— 别让描述靠数量说话 */
  it('keeps the description from counting things', () => {
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('不要靠数量表达');
  });

  /* 一句里塞满「随后」「才」，画图的人读不懂 */
  it('asks for short sentences, one thing each', () => {
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('一件事一小句');
  });

  /* 分成四行是为了好改：换个比喻只重写「场景」那一行，别的不动 */
  it('asks for four labelled lines instead of a paragraph', () => {
    for (const field of ['场景：', '构图：', '画面：', '重点：']) {
      expect(FIGURE_DESCRIBE_SYSTEM, field).toContain(field);
    }
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

  /* 画面描述是写给「没上过这门课的画师」看的，不是写代码含义 */
  it('frames it as a picture for someone who never took the course', () => {
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('他没上过这门课');
    expect(FIGURE_DESCRIBE_SYSTEM).toContain('看得见的东西');
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

  /* 最终提示词三段里题目那段也得是英文，不能一半中文 */
  it('translates the theme along with the scene', () => {
    expect(FIGURE_TRANSLATE_SYSTEM).toContain('Theme:');
    expect(FIGURE_TRANSLATE_SYSTEM).toContain('Scene:');
  });
});

describe('buildFigureTranslateRequest', () => {
  it('hands the translator both lines', () => {
    const text = buildFigureTranslateRequest('4.1 自增和自减', '一只手把糖放进盒子');
    expect(text).toContain('Theme: 4.1 自增和自减');
    expect(text).toContain('Scene: 一只手把糖放进盒子');
  });

  it('says so when the page has no title', () => {
    expect(buildFigureTranslateRequest('', '一段描述')).toContain('没有题目');
  });
});

describe('parseFigureTranslation', () => {
  it('splits the two lines back apart', () => {
    const { theme, scene } = parseFigureTranslation(
      'Theme: Increment and decrement\nScene: a hand drops a candy into a box',
      '4.1 自增和自减',
    );
    expect(theme).toBe('Increment and decrement');
    expect(scene).toBe('a hand drops a candy into a box');
  });

  /* 模型没按格式来时流程不能卡死：题目留原来的，整段当画面 */
  it('falls back when the model ignores the format', () => {
    const { theme, scene } = parseFigureTranslation('a hand drops a candy into a box', '4.1 自增和自减');
    expect(theme).toBe('4.1 自增和自减');
    expect(scene).toBe('a hand drops a candy into a box');
  });

  it('falls back when the page had no title to translate', () => {
    const { theme } = parseFigureTranslation(
      'Theme: （这一页没有题目）\nScene: a box',
      '',
    );
    expect(theme).toBe('');
  });
});

describe('composeImagePrompt', () => {
  /* 最终提示词三段：题目划范围、画面讲内容、风格定长相 */
  it('leads with the theme, then the styled scene', () => {
    const full = composeImagePrompt('Increment and decrement', 'a hand drops a candy into a box', 'whiteboard');
    expect(full.startsWith('Theme: Increment and decrement')).toBe(true);
    expect(full.indexOf('a hand drops a candy into a box')).toBeGreaterThan(0);
    expect(full).toContain('whiteboard marker sketch');
  });

  /* 不讲这句，画图模型会把题目当成要写进图里的字 */
  it('tells the image model the theme is not text to draw', () => {
    expect(composeImagePrompt('A topic', 'a box', 'lecture')).toContain('never render it as text');
  });

  it('skips the theme line when the page has no title', () => {
    const full = composeImagePrompt('', 'a box', 'lecture');
    expect(full.startsWith('a box.')).toBe(true);
  });
});
