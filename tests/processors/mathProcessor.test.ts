import { describe, it, expect } from 'vitest';
import { applyMath, extractMath } from '../../src/processors/mathProcessor';
import { PipelineOrchestrator } from '../../src/processors';
import { DEFAULT_SETTINGS } from '../../src/types/config';

/** 渲染桩：贴近 Obsidian（标题带 data-heading、代码块不裹 <p>） */
const render = async (markdown: string): Promise<string> => {
  const blocks: string[] = [];
  const withFences = markdown.replace(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm, (_m, lang: string, code: string) => {
    const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    blocks.push(`<pre class="language-${lang.trim()}"><code class="language-${lang.trim()}">${esc}</code></pre>`);
    return `@@B${blocks.length - 1}@@`;
  });
  const html = withFences
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t) return '';
      if (/^@@B\d+@@$/.test(t)) return t;
      const h = /^(#{1,6})\s+(.*)$/.exec(t);
      if (h) return `<h${h[1].length} data-heading="${h[2]}">${h[2]}</h${h[1].length}>`;
      if (/^- /.test(t)) {
        return `<ul>${t.split('\n').map((li) => `<li>${li.replace(/^- /, '')}</li>`).join('')}</ul>`;
      }
      return `<p dir="auto">${t.split('\n').join('<br>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
  return html.replace(/@@B(\d+)@@/g, (_m, n: string) => blocks[Number(n)]);
};

const run = (md: string) =>
  new PipelineOrchestrator().run(md, {
    settings: { ...DEFAULT_SETTINGS },
    sourcePath: 'note.md',
    renderMarkdown: render,
  });

describe('extractMath', () => {
  it('pulls out inline math', () => {
    const { text, maths } = extractMath('当$I_b ≈ 0$，则电路断开');
    expect(maths).toEqual([{ tex: 'I_b ≈ 0', display: false }]);
    expect(text).toBe('当⟦RFO-MATH-0⟧，则电路断开');
  });

  it('pulls out display math', () => {
    const { text, maths } = extractMath('$$I_C = \\beta I_b$$');
    expect(maths).toEqual([{ tex: 'I_C = \\beta I_b', display: true }]);
    expect(text).toBe('⟦RFO-MATH-0⟧');
  });

  it('handles several formulas in one line', () => {
    const { maths } = extractMath('当$I_b$较小，则$I_C = β × I_b$');
    expect(maths.map((m) => m.tex)).toEqual(['I_b', 'I_C = β × I_b']);
  });

  /* 代码块里的 $ 是 shell 变量，不是公式 */
  it('leaves dollars inside a fence alone', () => {
    const source = '```bash\necho $HOME && echo $PATH\n```';
    expect(extractMath(source)).toEqual({ text: source, maths: [] });
  });

  it('leaves dollars inside inline code alone', () => {
    const source = '写 `$HOME` 就行';
    expect(extractMath(source)).toEqual({ text: source, maths: [] });
  });

  /* 转义的 \$ 是字面美元号，价格区间最容易被整段吃掉 */
  it('leaves escaped dollars alone', () => {
    const source = '价格 \\$100 到 \\$200';
    expect(extractMath(source).maths).toHaveLength(0);
  });

  /* 首尾带空格的不算公式：「$100 到 $200」两个价格夹一段话，正是这条挡住的 */
  it('does not treat spaced dollars as math', () => {
    expect(extractMath('$100 到 $200 之间').maths).toHaveLength(0);
    expect(extractMath('$ x $').maths).toHaveLength(0);
  });

  it('returns the text untouched when there is no dollar sign', () => {
    expect(extractMath('没有公式')).toEqual({ text: '没有公式', maths: [] });
  });
});

describe('applyMath', () => {
  it('turns the token into a placeholder carrying the TeX', () => {
    const html = applyMath('<p>当⟦RFO-MATH-0⟧，则</p>', [{ tex: 'I_b ≈ 0', display: false }]);
    expect(html).toContain('<span class="rfo-math" data-tex="I_b ≈ 0">');
    expect(html).toContain('当<span');
    expect(html).toContain('，则</p>');
  });

  /* MathJax 没跑起来时屏幕上也该有东西看 */
  it('keeps the original $...$ as placeholder text', () => {
    const html = applyMath('<p>⟦RFO-MATH-0⟧</p>', [{ tex: 'x^2', display: false }]);
    expect(html).toContain('>$x^2$</span>');
  });

  it('marks display math', () => {
    const html = applyMath('<p>⟦RFO-MATH-0⟧</p>', [{ tex: 'x^2', display: true }]);
    expect(html).toContain('data-display="true"');
    expect(html).toContain('>$$x^2$$</span>');
  });

  /* Obsidian 会把标题原文抄进 data-heading，标记留在那儿就是一串乱码 */
  it('restores the TeX inside attributes instead of leaving a token', () => {
    const html = applyMath('<h1 data-heading="状态 ⟦RFO-MATH-0⟧">状态 ⟦RFO-MATH-0⟧</h1>', [
      { tex: 'I_C', display: false },
    ]);
    expect(html).toContain('data-heading="状态 I_C"');
    expect(html).not.toContain('⟦RFO-MATH-');
  });

  it('leaves html without tokens untouched', () => {
    expect(applyMath('<p>没有公式</p>', [])).toBe('<p>没有公式</p>');
  });
});

describe('end to end: 公式在 grid 里', () => {
  it('renders inline math inside a grid list', async () => {
    const deck = await run(
      '<grid dim="48 80" pos="50 10" class="abstract">\n\n' +
        '- **截止状态**：当$I_b ≈ 0$，则$I_C ≈ 0$，电路断开。\n\n' +
        '</grid>',
    );
    const html = deck.pages[0].html;
    expect(html).toContain('class="grid abstract"');
    expect(html).toContain('<span class="rfo-math" data-tex="I_b ≈ 0">');
    expect(html).toContain('<span class="rfo-math" data-tex="I_C ≈ 0">');
    expect(html).not.toContain('⟦RFO-MATH-');
  });

  it('keeps shell variables in a code block out of it', async () => {
    const deck = await run('```bash\necho $HOME\n```');
    expect(deck.pages[0].html).toContain('echo $HOME');
    expect(deck.pages[0].html).not.toContain('rfo-math');
  });
});
