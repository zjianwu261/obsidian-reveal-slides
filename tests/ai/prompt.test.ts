import { describe, it, expect } from 'vitest';
import { buildUserMessage, collectClassNames, stripFence } from '../../src/ai/prompt';

describe('collectClassNames', () => {
  /* 选择器列表（.body, .abstract）里的每个名字都要收，只认第一个会漏掉一半版式 */
  it('picks the layout classes out of the course css', () => {
    const css = `
:root { --brand: #064FA1; }
.bar { background: var(--brand); }
.bar h2 { font-size: 1.3rem; }
.body,
.abstract { text-align: left; }
`;
    expect(collectClassNames(css)).toEqual(['bar', 'body', 'abstract']);
  });
});

describe('buildUserMessage', () => {
  it('carries the page source and the request', () => {
    const msg = buildUserMessage({ pageSource: '# 标题', classNames: ['bar'], request: '配张图' });
    expect(msg).toContain('bar');
    expect(msg).toContain('# 标题');
    expect(msg).toContain('配张图');
  });
});

describe('stripFence', () => {
  it('unwraps a fenced reply', () => {
    expect(stripFence('```markdown\n# 标题\n```')).toBe('# 标题');
  });

  it('leaves a bare reply alone, fences inside it included', () => {
    const reply = '# 标题\n\n```figure\n{"type":"flow"}\n```\n\n正文';
    expect(stripFence(reply)).toBe(reply);
  });
});
