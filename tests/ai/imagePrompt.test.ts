import { describe, it, expect } from 'vitest';
import {
  IMAGE_PROMPT_SYSTEM,
  buildImagePromptRequest,
  cleanImagePrompt,
  shapeForBox,
} from '../../src/ai/imagePrompt';

describe('IMAGE_PROMPT_SYSTEM', () => {
  /* 生成模型写不好字，中文尤其糊成一团 —— 这条不能漏 */
  it('forbids text inside the picture', () => {
    expect(IMAGE_PROMPT_SYSTEM).toContain('no text');
  });

  it('asks for a metaphor rather than the abstract idea itself', () => {
    expect(IMAGE_PROMPT_SYSTEM).toContain('比喻');
  });
});

describe('buildImagePromptRequest', () => {
  it('hands over the page and what was asked for', () => {
    const text = buildImagePromptRequest({ pageSource: '## 自增\nnote: 讲稿', request: '配张图' });
    expect(text).toContain('note: 讲稿');
    expect(text).toContain('配张图');
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
