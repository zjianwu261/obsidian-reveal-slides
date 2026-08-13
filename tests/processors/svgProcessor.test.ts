import { describe, it, expect } from 'vitest';
import { processSvgBlocks } from '../../src/processors/svgProcessor';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
const ESCAPED_SVG = SVG.replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('processSvgBlocks', () => {
  it('converts a language-svg code block into a data uri img', () => {
    const out = processSvgBlocks(`<pre><code class="language-svg">${ESCAPED_SVG}</code></pre>`);
    expect(out).toContain('class="rfo-svg"');
    expect(out).not.toContain('<pre>');

    const base64 = /data:image\/svg\+xml;base64,([^"]+)/.exec(out)?.[1];
    expect(base64).toBeTruthy();
    expect(Buffer.from(base64!, 'base64').toString('utf-8')).toBe(SVG);
  });

  it('matches loosely when class carries extra markers', () => {
    const out = processSvgBlocks(
      `<pre><code class="language-svg is-loaded">${ESCAPED_SVG}</code></pre>`,
    );
    expect(out).toContain('class="rfo-svg"');
  });

  it('keeps code blocks whose content has no <svg', () => {
    const html = '<pre><code class="language-svg">&lt;div&gt;not svg&lt;/div&gt;</code></pre>';
    const out = processSvgBlocks(html);
    expect(out).toContain('<pre>');
    expect(out).not.toContain('rfo-svg');
  });

  it('leaves other language code blocks untouched', () => {
    const html = '<pre><code class="language-js">const a = 1;</code></pre>';
    expect(processSvgBlocks(html)).toContain('language-js');
  });
});
