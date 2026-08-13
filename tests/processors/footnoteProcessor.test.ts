import { describe, it, expect } from 'vitest';
import { processInlineMarkup } from '../../src/processors/footnoteProcessor';

describe('processInlineMarkup (emoji)', () => {
  it('replaces known emoji shortcodes in text', () => {
    const out = processInlineMarkup('<p>Hello :smile: :rocket:</p>');
    expect(out).toContain('Hello 😄 🚀');
  });

  it('keeps unknown shortcodes as-is', () => {
    const out = processInlineMarkup('<p>:not_a_real_emoji:</p>');
    expect(out).toContain(':not_a_real_emoji:');
  });

  it('does not replace inside code blocks', () => {
    const html = '<pre><code class="language-js">const s = ":smile:";</code></pre>';
    const out = processInlineMarkup(html);
    expect(out).toContain(':smile:');
    expect(out).not.toContain('😄');
  });

  it('does not replace inside inline code', () => {
    const out = processInlineMarkup('<p><code>:smile:</code> :heart:</p>');
    expect(out).toContain('<code>:smile:</code>');
    expect(out).toContain('❤️');
  });
});

describe('processInlineMarkup (font awesome)', () => {
  it('converts :fas_*: to a solid icon element', () => {
    const out = processInlineMarkup('<p>:fas_rocket:</p>');
    expect(out).toContain('<i class="fa-solid fa-rocket"></i>');
  });

  it('converts :fab_*: to a brands icon element', () => {
    const out = processInlineMarkup('<p>:fab_github:</p>');
    expect(out).toContain('<i class="fa-brands fa-github"></i>');
  });

  it('does not convert fa shortcodes inside code blocks', () => {
    const out = processInlineMarkup('<pre><code>:fas_rocket:</code></pre>');
    expect(out).toContain(':fas_rocket:');
    expect(out).not.toContain('fa-solid');
  });
});
