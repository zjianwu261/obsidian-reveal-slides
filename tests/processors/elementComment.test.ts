import { describe, it, expect } from 'vitest';
import { processElementComments } from '../../src/processors/elementComment';

describe('processElementComments (.element)', () => {
  it('applies class and style to the previous element sibling', () => {
    const { html } = processElementComments(
      '<p>hello</p>\n<!-- .element: class="big" style="color:red" -->',
    );
    expect(html).toContain('class="big"');
    expect(html).toContain('style="color:red"');
    expect(html).not.toContain('.element');
  });

  it('merges class with existing classes', () => {
    const { html } = processElementComments('<p class="a">x</p><!-- .element: class="b c" -->');
    expect(html).toContain('class="a b c"');
  });

  it('appends style to existing inline style', () => {
    const { html } = processElementComments(
      '<p style="margin: 0;">x</p><!-- .element: style="color: red" -->',
    );
    expect(html).toContain('style="margin: 0; color: red"');
  });

  it('sets arbitrary attributes via setAttribute', () => {
    const { html } = processElementComments('<p>x</p><!-- .element: data-foo="bar" -->');
    expect(html).toContain('data-foo="bar"');
  });

  it('applies to the parent element when inline inside it', () => {
    const { html } = processElementComments('<p>hello <!-- .element: class="hl" --></p>');
    expect(html).toContain('<p class="hl">hello ');
  });

  it('targets the element before a comment-only paragraph wrapper', () => {
    const { html } = processElementComments(
      '<p>real</p><p><!-- .element: class="big" --></p>',
    );
    expect(html).toContain('<p class="big">real</p>');
  });
});

describe('processElementComments (.slide)', () => {
  it('collects slide attributes with background key normalization', () => {
    const { html, slideAttributes } = processElementComments(
      '<p>content</p>\n<!-- .slide: background-color="#fff" -->',
    );
    expect(slideAttributes).toEqual({ 'data-background-color': '#fff' });
    expect(html).not.toContain('.slide');
  });

  it('maps background to data-background-image', () => {
    const { slideAttributes } = processElementComments('<!-- .slide: background="bg.png" -->');
    expect(slideAttributes['data-background-image']).toBe('bg.png');
  });

  it('removes the comment-only paragraph wrapper for slide comments', () => {
    const { html } = processElementComments('<p>a</p><p><!-- .slide: transition="fade" --></p>');
    expect(html).not.toContain('.slide');
    expect(html).toContain('<p>a</p>');
  });
});

describe('processElementComments (placeholders)', () => {
  it('keeps GRID/SPLIT placeholder comments untouched', () => {
    const { html, slideAttributes } = processElementComments(
      '<p>a</p><!--GRID_0--><p>b</p><!--SPLIT_1-->',
    );
    expect(html).toContain('<!--GRID_0-->');
    expect(html).toContain('<!--SPLIT_1-->');
    expect(slideAttributes).toEqual({});
  });
});
