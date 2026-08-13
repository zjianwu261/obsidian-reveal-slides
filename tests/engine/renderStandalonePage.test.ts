import { describe, it, expect } from 'vitest';
import { buildSectionsHtml, renderStandalonePage } from '../../src/engine/templateEngine';
import type { StandaloneAssets } from '../../src/engine/templateEngine';
import type { SlideDeck } from '../../src/types/slide';

const assets: StandaloneAssets = {
  resetCss: '/*reset*/',
  revealCss: '/*reveal*/',
  highlightCss: '/*highlight*/',
  pluginCss: '/*plugin*/',
  bundleJs: 'console.log("bundle");',
};

function makeDeck(overrides: Partial<SlideDeck> = {}): SlideDeck {
  return {
    title: 'My Talk',
    pages: [
      { index: 0, type: 'horizontal', html: '<h1>Hi</h1>', notes: [], attributes: {} },
    ],
    config: {},
    cssVariables: '',
    customCSS: [],
    remoteCSS: [],
    ...overrides,
  };
}

describe('renderStandalonePage', () => {
  it('inlines all CSS assets and the bundle JS', () => {
    const html = renderStandalonePage(makeDeck(), assets);
    expect(html).toContain('/*reset*/');
    expect(html).toContain('/*reveal*/');
    expect(html).toContain('/*highlight*/');
    expect(html).toContain('/*plugin*/');
    expect(html).toContain('console.log("bundle");');
    // 不引用任何外部样式/脚本路径
    expect(html).not.toContain('<link rel="stylesheet" href="/assets/');
    expect(html).not.toContain('src="/assets/');
  });

  it('injects the deck as window.__DECK__ and keeps the reveal container', () => {
    const html = renderStandalonePage(makeDeck(), assets);
    expect(html).toContain('<div class="reveal">');
    expect(html).toContain('<div class="slides"></div>');
    expect(html).toContain('window.__DECK__ = ');
    expect(html).toContain('"title":"My Talk"');
    expect(html).toContain('<title>My Talk</title>');
  });

  it('escapes "</" inside the deck JSON so the script tag is not closed early', () => {
    const deck = makeDeck();
    deck.pages[0].html = '<script>alert(1)</script>';
    const html = renderStandalonePage(deck, assets);
    expect(html).toContain('<\\/script>');
    // deck JSON 段内不得出现未转义的 "</script>"
    const deckScript = html.split('window.__DECK__ = ')[1].split(';</script>')[0];
    expect(deckScript).not.toContain('</script>');
  });

  it('escapes "</script" inside the inlined bundle JS', () => {
    const tricky: StandaloneAssets = { ...assets, bundleJs: 'const s = "</script>";' };
    const html = renderStandalonePage(makeDeck(), tricky);
    expect(html).toContain('const s = "<\\/script>";');
  });

  it('falls back to a default title', () => {
    const html = renderStandalonePage(makeDeck({ title: '' }), assets);
    expect(html).toContain('<title>Slide Preview</title>');
  });
});

describe('buildSectionsHtml canvas layout', () => {
  it('marks grid pages so the section gets a definite height', () => {
    const html = buildSectionsHtml(
      makeDeck({
        pages: [
          {
            index: 0,
            type: 'horizontal',
            html: '<div class="grid" style="height: 30%;">x</div>',
            notes: [],
            attributes: {},
          },
        ],
      }),
    );
    expect(html).toContain('class="rfo-canvas"');
  });

  it('leaves plain text pages untouched', () => {
    const html = buildSectionsHtml(makeDeck());
    expect(html).not.toContain('rfo-canvas');
  });

  it('keeps .slide comment classes when adding the canvas class', () => {
    const html = buildSectionsHtml(
      makeDeck({
        pages: [
          {
            index: 0,
            type: 'horizontal',
            html: '<div class="grid">x</div>',
            notes: [],
            attributes: { class: 'mine' },
          },
        ],
      }),
    );
    expect(html).toContain('class="mine rfo-canvas"');
  });

  it('marks the vertical stack wrapper too', () => {
    const html = buildSectionsHtml(
      makeDeck({
        pages: [
          { index: 0, type: 'horizontal', html: '<h1>Hi</h1>', notes: [], attributes: {} },
          {
            index: 1,
            type: 'vertical',
            html: '<div class="grid">x</div>',
            notes: [],
            attributes: {},
          },
        ],
      }),
    );
    expect(html).toContain('<section class="rfo-canvas">');
  });
});
