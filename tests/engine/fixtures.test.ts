/**
 * 快照测试（TASK_PLAN §六「测试策略」）：
 * tests/fixtures/ 下的完整 Markdown → 管线 → reveal <section> HTML，
 * 改动 processor / transformer 后用 `npx vitest -u` 更新快照并人工复核 diff。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PipelineOrchestrator } from '../../src/processors';
import { buildSectionsHtml } from '../../src/engine/templateEngine';
import { DEFAULT_SETTINGS } from '../../src/types/config';

/**
 * Markdown 渲染桩：真实渲染由 Obsidian MarkdownRenderer 完成（测试环境没有），
 * 这里只覆盖快照需要区分的结构：标题、列表、围栏代码块、段落。
 */
const fakeRender = async (markdown: string): Promise<string> =>
  markdown
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';

      const fence = /^```(\w*)\n([\s\S]*?)\n```$/.exec(trimmed);
      if (fence) {
        const language = fence[1] ? ` class="language-${fence[1]}"` : '';
        return `<pre><code${language}>${escape(fence[2])}</code></pre>`;
      }

      const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;

      if (/^[-*]\s/.test(trimmed)) {
        const items = trimmed
          .split('\n')
          .map((line) => `<li>${line.replace(/^[-*]\s+/, '')}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }

      if (trimmed.startsWith('<')) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .filter(Boolean)
    .join('\n');

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fixture = (name: string) =>
  readFileSync(join(__dirname, '..', 'fixtures', `${name}.md`), 'utf8');

describe('fixture: full-deck', () => {
  const run = () =>
    new PipelineOrchestrator().run(fixture('full-deck'), {
      settings: { ...DEFAULT_SETTINGS },
      sourcePath: 'fixtures/full-deck.md',
      renderMarkdown: fakeRender,
    });

  it('produces the expected deck structure', async () => {
    const deck = await run();
    expect({
      title: deck.title,
      transition: deck.config.transition,
      cssVariables: deck.cssVariables,
      pages: deck.pages.map((page) => ({ type: page.type, notes: page.notes.length })),
    }).toMatchSnapshot();
  });

  it('renders stable section html', async () => {
    const deck = await run();
    expect(buildSectionsHtml(deck)).toMatchSnapshot();
  });

  it('keeps separators inside code blocks from paginating', async () => {
    const deck = await run();
    // 3 页横向 + 1 页纵向；代码块内的 --- / xxx 不参与分页
    expect(deck.pages.map((p) => p.type)).toEqual([
      'horizontal',
      'horizontal',
      'horizontal',
      'vertical',
    ]);
    expect(deck.pages[2].html).toContain("const sep = '---';");
  });
});
