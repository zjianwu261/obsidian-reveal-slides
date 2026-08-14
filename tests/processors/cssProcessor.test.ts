import { describe, it, expect } from 'vitest';
import { cssFromFile, extractStyleBlocks } from '../../src/processors/cssProcessor';

describe('extractStyleBlocks', () => {
  it('pulls the style block out and keeps the line count', () => {
    const { body, css } = extractStyleBlocks('<style>\n.a { color: red; }\n</style>\n\n# 标题');
    expect(css).toBe('.a { color: red; }');
    // 行号必须对得上源文件，否则光标跟随会跳错页
    expect(body.split('\n').length).toBe('<style>\n.a { color: red; }\n</style>\n\n# 标题'.split('\n').length);
  });

  it('leaves a <style> inside a code block alone', () => {
    const source = '```html\n<style>.demo { color: red }</style>\n```';
    const { css } = extractStyleBlocks(source);
    expect(css).toBe('');
  });
});

describe('cssFromFile', () => {
  it('uses a .css file verbatim', () => {
    expect(cssFromFile('themes/course.css', '.a { color: red; }')).toBe('.a { color: red; }');
  });

  it('takes the ```css block out of a .md file', () => {
    const note = '# 课程主题\n\n说明文字，不应进入样式。\n\n```css\n.cover { color: #fff; }\n```\n';
    expect(cssFromFile('themes/course.md', note)).toBe('.cover { color: #fff; }');
  });

  it('joins several css blocks', () => {
    const note = '```css\n.a { color: red; }\n```\n\n中间的说明\n\n```css\n.b { color: blue; }\n```';
    expect(cssFromFile('themes/course.md', note)).toBe('.a { color: red; }\n\n.b { color: blue; }');
  });

  it('also accepts a <style> block in a .md file', () => {
    expect(cssFromFile('themes/course.md', '<style>\n.a { color: red; }\n</style>')).toBe(
      '.a { color: red; }',
    );
  });

  it('ignores code blocks of other languages', () => {
    const note = '```js\nconst a = 1;\n```\n\n```css\n.a { color: red; }\n```';
    expect(cssFromFile('themes/course.md', note)).toBe('.a { color: red; }');
  });

  it('returns nothing for a .md file with no styles', () => {
    expect(cssFromFile('themes/course.md', '# 只是一篇普通笔记')).toBe('');
  });
});
