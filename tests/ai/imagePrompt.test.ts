import { describe, it, expect } from 'vitest';
import {
  IMAGE_PROMPT_SYSTEM,
  buildImagePromptRequest,
  cleanImagePrompt,
  extractNotes,
  shapeForBox,
} from '../../src/ai/imagePrompt';

describe('IMAGE_PROMPT_SYSTEM', () => {
  /* 生成模型写不好字，中文尤其糊成一团 —— 这条不能漏 */
  it('forbids text inside the picture', () => {
    expect(IMAGE_PROMPT_SYSTEM).toContain('no text');
  });

  /* 讲稿才是这张图的题目，幻灯片正文是压缩过的结论 */
  it('tells the model to work from the speaker notes', () => {
    expect(IMAGE_PROMPT_SYSTEM).toContain('note: 讲稿为准');
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

describe('buildImagePromptRequest', () => {
  /* 讲稿混在整页源码里的话，模型多半只扫一眼标题就动笔了 */
  it('puts the speaker notes first, before the page source', () => {
    const text = buildImagePromptRequest({
      pageSource: '## 自增\n\n- 要点\n\nnote: 先取旧值，回头才加一',
      request: '配张图',
    });
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
