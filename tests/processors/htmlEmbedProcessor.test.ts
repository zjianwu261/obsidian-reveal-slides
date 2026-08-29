import { describe, it, expect } from 'vitest';
import { extractHtmlEmbeds, applyHtmlEmbeds } from '../../src/processors/htmlEmbedProcessor';

const resolve = (linkpath: string): string | null =>
  linkpath.includes('缺') ? null : `app://vault-id/Users/me/vault/assets/${linkpath}?123`;

/** 走完「渲染前抽取 → 渲染后回填」两步（渲染器对标记原样透传） */
function roundTrip(markdown: string, html?: string, serverBase?: string): string {
  const { text, embeds } = extractHtmlEmbeds(markdown, resolve);
  return applyHtmlEmbeds(html ?? `<p>${text}</p>`, embeds, serverBase);
}

describe('extractHtmlEmbeds', () => {
  it('replaces ![[x.html]] with a token', () => {
    const { text, embeds } = extractHtmlEmbeds('![[demo.html]]', resolve);
    expect(text).toBe('⟦RFO-HTML-0⟧');
    expect(embeds).toHaveLength(1);
    expect(embeds[0].linkpath).toBe('demo.html');
  });

  it('reads the |800x450 size suffix', () => {
    const { embeds } = extractHtmlEmbeds('![[demo.html|800x450]]', resolve);
    expect(embeds[0]).toMatchObject({ width: 800, height: 450 });
  });

  it('skips embeds inside code blocks', () => {
    const markdown = '```md\n![[demo.html]]\n```';
    const { text, embeds } = extractHtmlEmbeds(markdown, resolve);
    expect(text).toBe(markdown);
    expect(embeds).toHaveLength(0);
  });

  it('leaves images and notes alone', () => {
    const markdown = '![[图.png]] 和 ![[另一篇笔记]]';
    expect(extractHtmlEmbeds(markdown, resolve).embeds).toHaveLength(0);
  });

  it('does nothing without a resolver', () => {
    const { text, embeds } = extractHtmlEmbeds('![[demo.html]]');
    expect(text).toBe('![[demo.html]]');
    expect(embeds).toHaveLength(0);
  });
});

describe('applyHtmlEmbeds', () => {
  it('turns the token into a placeholder and drops the wrapping <p>', () => {
    const out = roundTrip('![[demo.html]]');
    expect(out).toContain('class="rfo-html"');
    expect(out).not.toContain('<p>');
  });

  it('rewrites app:// to the preview server /vault route', () => {
    const out = roundTrip('![[demo.html]]', undefined, 'http://127.0.0.1:3000');
    expect(out).toContain('data-src="http://127.0.0.1:3000/vault/Users/me/vault/assets/demo.html"');
  });

  it('keeps the app:// url when there is no server (inline channel)', () => {
    expect(roundTrip('![[demo.html]]')).toContain('data-src="app://vault-id/');
  });

  it('carries the explicit size onto the element', () => {
    const out = roundTrip('![[demo.html|800x450]]');
    expect(out).toContain('width:800px');
    expect(out).toContain('height:450px');
  });

  it('replaces in place when the paragraph has other text', () => {
    const { text, embeds } = extractHtmlEmbeds('看这个 ![[demo.html]] 演示', resolve);
    const out = applyHtmlEmbeds(`<p>${text}</p>`, embeds);
    expect(out).toContain('<p>看这个 <div class="rfo-html"');
    expect(out).toContain('演示</p>');
  });

  it('shows a warning when the file is missing', () => {
    const out = roundTrip('![[缺失.html]]');
    expect(out).toContain('rfo-html-missing');
    expect(out).toContain('缺失.html');
    expect(out).not.toContain('rfo-html"');
  });

  it('leaves html without tokens untouched', () => {
    expect(applyHtmlEmbeds('<p>纯文本</p>', [])).toBe('<p>纯文本</p>');
  });
});
