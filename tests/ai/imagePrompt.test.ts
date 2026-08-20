import { describe, it, expect } from 'vitest';
import {
  IMAGE_PROMPT_SYSTEM,
  IMAGE_STYLE,
  buildImagePromptRequest,
  cleanImagePrompt,
  extractNotes,
  extractTitle,
  parseImagePlan,
  shapeForBox,
  withStyle,
} from '../../src/ai/imagePrompt';

describe('IMAGE_PROMPT_SYSTEM', () => {
  /* 生成模型写不好字，中文尤其糊成一团 —— 这条由固定风格那段兜着 */
  it('forbids text inside the picture', () => {
    expect(IMAGE_STYLE).toContain('no text');
    expect(IMAGE_PROMPT_SYSTEM).toContain('图里不许有文字');
  });

  /* 风格由插件定死，模型那 80 个词全花在内容上 */
  it('tells the model not to spend words on style', () => {
    expect(IMAGE_PROMPT_SYSTEM).toContain('不用写风格');
  });

  /* 题目划范围、讲稿给内容 —— 讲稿常常从上一页的话头讲起 */
  it('tells the model what each part is for', () => {
    expect(IMAGE_PROMPT_SYSTEM).toContain('题目划定范围');
    expect(IMAGE_PROMPT_SYSTEM).toContain('note: 讲稿决定内容');
  });

  /* 讲稿罗列五样东西时各画一格，出来的是图例不是讲解 */
  it('says where to look for the one thing worth drawing', () => {
    expect(IMAGE_PROMPT_SYSTEM).toContain('最容易混淆');
    expect(IMAGE_PROMPT_SYSTEM).toContain('不要五样各画一格');
  });

  /* 抽象名词只会换来一堆发光的电路和齿轮 */
  it('bans the vague words that produce stock art', () => {
    expect(IMAGE_PROMPT_SYSTEM).toContain('concept of increment');
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

describe('buildImagePromptRequest', () => {
  /* 题目划范围、讲稿给内容：两样都得摆在整页源码前面，不然模型只扫一眼就动笔 */
  it('leads with the title and the speaker notes', () => {
    const text = buildImagePromptRequest({
      pageSource: '## 4.1 自增和自减\n\n- 要点\n\nnote: 先取旧值，回头才加一',
      request: '配张图',
    });
    expect(text.indexOf('4.1 自增和自减')).toBeLessThan(text.indexOf('先取旧值'));
    expect(text.indexOf('先取旧值，回头才加一')).toBeLessThan(text.indexOf('完整源码'));
    expect(text).toContain('配张图');
  });

  it('says so when the page has no notes to work from', () => {
    const text = buildImagePromptRequest({ pageSource: '## 标题\n\n- 要点', request: '配张图' });
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

describe('IMAGE_STYLE', () => {
  /* 每页自己想风格＝每页抽一次卡，一本课件看着像好几个人拼的 */
  it('pins the look down instead of leaving it to chance', () => {
    expect(IMAGE_STYLE).toContain('flat vector illustration');
    expect(IMAGE_STYLE).toContain('lecture slide');
    expect(IMAGE_STYLE).toContain('no 3D rendering');
  });
});

describe('withStyle', () => {
  it('puts the fixed style behind whatever was written', () => {
    const full = withStyle('a hand pouring a value into a box');
    expect(full.startsWith('a hand pouring a value into a box.')).toBe(true);
    expect(full).toContain(IMAGE_STYLE);
  });

  it('does not double up the full stop', () => {
    expect(withStyle('a box.')).not.toContain('..');
  });
});

describe('parseImagePlan', () => {
  const reply = '画什么：右边先算完，结果再倒进左边那个盒子\nprompt: a hand pouring a token into a box';

  /* 一张图要跑一分钟，跑完才发现跑偏了太亏 —— 先说打算画什么 */
  it('splits the sentence for you from the prompt for the model', () => {
    expect(parseImagePlan(reply)).toEqual({
      plan: '右边先算完，结果再倒进左边那个盒子',
      prompt: 'a hand pouring a token into a box',
    });
  });

  /* 格式没守住就整段当提示词：图照画，只是少了那句给人看的话 */
  it('still draws when the model ignores the format', () => {
    const loose = parseImagePlan('a hand pouring a token into a box');
    expect(loose.plan).toBe('');
    expect(loose.prompt).toBe('a hand pouring a token into a box');
  });

  it('drops a code fence', () => {
    expect(parseImagePlan('```\nprompt: a box\n```').prompt).toBe('a box');
  });
});
