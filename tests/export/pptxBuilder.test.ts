import { describe, it, expect } from 'vitest';
import { buildPptx, xmlEscape } from '../../src/export/pptxBuilder';
import type { PptxDeckInput } from '../../src/export/pptxBuilder';
import { layoutRegions } from '../../src/export/pptxLayout';
import { parseSlideHtml } from '../../src/export/slideOutline';
import type { PptxShape } from '../../src/export/pptxLayout';

const CANVAS = { width: 1920, height: 1080 };
/** 幻灯片高度固定 7.5 英寸 = 6858000 EMU；16:9 时宽度正好是 PowerPoint 的 12192000 */
const SLIDE_HEIGHT = 6858000;

function deck(overrides: Partial<PptxDeckInput> = {}): PptxDeckInput {
  return {
    title: '测试',
    canvas: CANVAS,
    rootFontSize: 40,
    slides: [{ shapes: [], notes: [] }],
    media: [],
    ...overrides,
  };
}

function partMap(input: PptxDeckInput): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of buildPptx(input)) {
    map.set(entry.path, typeof entry.data === 'string' ? entry.data : entry.data.toString('binary'));
  }
  return map;
}

function textShape(
  text: string,
  box = { x: 0, y: 0, w: 960, h: 200 },
): Extract<PptxShape, { kind: 'text' }> {
  return {
    kind: 'text',
    box,
    anchor: 't',
    paragraphs: [
      { runs: [{ text, size: 1 }], size: 1, indent: -1, ordered: false, align: 'l' },
    ],
  };
}

describe('xmlEscape', () => {
  it('escapes the five XML entities', () => {
    expect(xmlEscape(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
  });

  it('strips control characters that would corrupt the package', () => {
    expect(xmlEscape('a\x00b\x1Fc')).toBe('abc');
    // 制表符 / 换行是合法的 XML 字符，不能连它们一起滤掉
    expect(xmlEscape('a\tb\nc')).toBe('a\tb\nc');
  });
});

describe('buildPptx package structure', () => {
  it('emits every part PowerPoint requires, with content types first', () => {
    const entries = buildPptx(deck());
    expect(entries[0].path).toBe('[Content_Types].xml');

    const paths = entries.map((entry) => entry.path);
    for (const required of [
      '_rels/.rels',
      'docProps/core.xml',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      'ppt/theme/theme1.xml',
      'ppt/slides/slide1.xml',
      'ppt/slides/_rels/slide1.xml.rels',
    ]) {
      expect(paths).toContain(required);
    }
  });

  it('declares an Override for every slide and points each one at the layout', () => {
    const parts = partMap(deck({ slides: [
      { shapes: [], notes: [] },
      { shapes: [], notes: [] },
      { shapes: [], notes: [] },
    ] }));

    const types = parts.get('[Content_Types].xml')!;
    expect(types.match(/presentationml\.slide\+xml/g)).toHaveLength(3);
    expect(parts.get('ppt/slides/_rels/slide2.xml.rels')).toContain(
      'Target="../slideLayouts/slideLayout1.xml"',
    );

    const presentation = parts.get('ppt/presentation.xml')!;
    expect(presentation.match(/<p:sldId /g)).toHaveLength(3);
    // sldMasterIdLst 必须排在 sldIdLst 之前，顺序错了 PowerPoint 直接判文件损坏
    expect(presentation.indexOf('<p:sldMasterIdLst>')).toBeLessThan(presentation.indexOf('<p:sldIdLst>'));
  });

  it('sizes the deck from the canvas aspect ratio', () => {
    const wide = partMap(deck()).get('ppt/presentation.xml')!;
    expect(wide).toContain(`<p:sldSz cx="12192000" cy="${SLIDE_HEIGHT}"/>`);

    const fourThree = partMap(deck({ canvas: { width: 1440, height: 1080 } })).get(
      'ppt/presentation.xml',
    )!;
    expect(fourThree).toContain(`<p:sldSz cx="9144000" cy="${SLIDE_HEIGHT}"/>`);
  });

  it('omits the notes master entirely when no slide has notes', () => {
    const paths = buildPptx(deck()).map((entry) => entry.path);
    expect(paths).not.toContain('ppt/notesMasters/notesMaster1.xml');
    expect(partMap(deck()).get('ppt/presentation.xml')).not.toContain('notesMasterIdLst');
  });

  it('adds notes parts, its own theme and the master link when notes exist', () => {
    const parts = partMap(deck({ slides: [{ shapes: [], notes: ['先讲背景', '再讲结论'] }] }));

    expect(parts.has('ppt/notesSlides/notesSlide1.xml')).toBe(true);
    // 备注母版与幻灯片母版共用一份主题会让 PowerPoint 判包结构有误
    expect(parts.get('ppt/notesMasters/_rels/notesMaster1.xml.rels')).toContain('theme2.xml');
    expect(parts.get('ppt/presentation.xml')).toContain('<p:notesMasterIdLst>');
    expect(parts.get('ppt/notesSlides/notesSlide1.xml')).toContain('先讲背景');
    expect(parts.get('ppt/slides/_rels/slide1.xml.rels')).toContain('notesSlide1.xml');
  });
});

describe('buildPptx shapes', () => {
  it('converts canvas pixels to EMU at the slide scale', () => {
    const parts = partMap(
      deck({ slides: [{ shapes: [textShape('x', { x: 960, y: 540, w: 480, h: 270 })], notes: [] }] }),
    );
    // 1920px 宽的画布映射到 12192000 EMU → 6350 EMU/px
    expect(parts.get('ppt/slides/slide1.xml')).toContain(
      '<a:off x="6096000" y="3429000"/><a:ext cx="3048000" cy="1714500"/>',
    );
  });

  it('renders a 1em run as 20pt on a 1920x1080 canvas', () => {
    const parts = partMap(deck({ slides: [{ shapes: [textShape('大小')], notes: [] }] }));
    expect(parts.get('ppt/slides/slide1.xml')).toContain('sz="2000"');
  });

  it('registers hyperlinks as external relationships', () => {
    const shape: PptxShape = {
      kind: 'text',
      box: { x: 0, y: 0, w: 100, h: 50 },
      anchor: 't',
      paragraphs: [
        {
          runs: [{ text: '文档', size: 1, link: 'https://example.dev/a?b=1&c=2' }],
          size: 1,
          indent: -1,
          ordered: false,
          align: 'l',
        },
      ],
    };
    const parts = partMap(deck({ slides: [{ shapes: [shape], notes: [] }] }));

    expect(parts.get('ppt/slides/slide1.xml')).toContain('<a:hlinkClick r:id="rId2"/>');
    const rels = parts.get('ppt/slides/_rels/slide1.xml.rels')!;
    expect(rels).toContain('TargetMode="External"');
    expect(rels).toContain('https://example.dev/a?b=1&amp;c=2');
  });

  it('embeds pictures as media parts with a matching content type', () => {
    const shape: PptxShape = {
      kind: 'image',
      box: { x: 0, y: 0, w: 400, h: 300 },
      src: 'app://vault/a.png',
      alt: '图',
    };
    const input = deck({
      slides: [{ shapes: [shape], notes: [] }],
      media: [{ src: 'app://vault/a.png', ext: 'png', data: Buffer.from([1, 2, 3]) }],
    });
    const parts = partMap(input);

    expect(parts.has('ppt/media/image1.png')).toBe(true);
    expect(parts.get('[Content_Types].xml')).toContain('Extension="png" ContentType="image/png"');
    expect(parts.get('ppt/slides/slide1.xml')).toContain('<a:blip r:embed="rId2"/>');
    expect(parts.get('ppt/slides/_rels/slide1.xml.rels')).toContain('../media/image1.png');
  });

  it('skips a picture whose media never loaded rather than writing a dangling rel', () => {
    const shape: PptxShape = {
      kind: 'image',
      box: { x: 0, y: 0, w: 10, h: 10 },
      src: 'https://remote/x.png',
      alt: '',
    };
    const parts = partMap(deck({ slides: [{ shapes: [shape], notes: [] }] }));
    expect(parts.get('ppt/slides/slide1.xml')).not.toContain('<p:pic>');
    expect(parts.get('ppt/slides/_rels/slide1.xml.rels')).not.toContain('media');
  });

  it('writes tables as a graphicFrame with one gridCol per column', () => {
    const shape: PptxShape = {
      kind: 'table',
      box: { x: 0, y: 0, w: 600, h: 200 },
      size: 0.7,
      rows: [
        [
          { runs: [{ text: '名', size: 0.7 }], header: true, align: null },
          { runs: [{ text: '值', size: 0.7 }], header: true, align: null },
        ],
        [
          { runs: [{ text: '甲', size: 0.7 }], header: false, align: null },
          { runs: [{ text: '1', size: 0.7 }], header: false, align: null },
        ],
      ],
    };
    const slide = partMap(deck({ slides: [{ shapes: [shape], notes: [] }] })).get('ppt/slides/slide1.xml')!;

    expect(slide).toContain('<p:graphicFrame>');
    expect(slide.match(/<a:gridCol /g)).toHaveLength(2);
    expect(slide.match(/<a:tr /g)).toHaveLength(2);
    expect(slide).toContain('F0F0F0'); // 表头底色
  });

  it('bakes the squeeze factor into the emitted font size', () => {
    const plain = partMap(deck({ slides: [{ shapes: [textShape('压缩')], notes: [] }] }));
    const squeezed = partMap(
      deck({ slides: [{ shapes: [{ ...textShape('压缩'), fontScale: 0.5 }], notes: [] }] }),
    );

    expect(plain.get('ppt/slides/slide1.xml')).toContain('sz="2000"');
    // 只声明 <a:normAutofit fontScale> 是没用的：Keynote / 预览不看那个属性
    expect(squeezed.get('ppt/slides/slide1.xml')).toContain('sz="1000"');
    expect(squeezed.get('ppt/slides/slide1.xml')).not.toContain('fontScale');
  });

  it('shrinks table cells with the same factor so rows still fit their box', () => {
    const table = (fontScale?: number): PptxShape => ({
      kind: 'table',
      box: { x: 0, y: 0, w: 600, h: 200 },
      size: 1,
      fontScale,
      rows: [[{ runs: [{ text: '格', size: 1 }], header: false, align: null }]],
    });
    const slideOf = (shape: PptxShape): string =>
      partMap(deck({ slides: [{ shapes: [shape], notes: [] }] })).get('ppt/slides/slide1.xml')!;

    const plain = slideOf(table());
    const squeezed = slideOf(table(0.5));

    expect(plain).toContain('sz="2000"');
    expect(squeezed).toContain('sz="1000"');

    // 内边距也得跟着缩，写死的 EMU 会替行高撑出一个下限
    const marginOf = (xml: string): number => Number(/<a:tcPr marL="(\d+)"/.exec(xml)![1]);
    expect(marginOf(squeezed)).toBeCloseTo(marginOf(plain) / 2, -1);
  });

  it('single-spaces table cells so a row fits the height the layout reserved', () => {
    const shape: PptxShape = {
      kind: 'table',
      box: { x: 0, y: 0, w: 600, h: 200 },
      size: 1,
      rows: [[{ runs: [{ text: '格', size: 1 }], header: false, align: null }]],
    };
    const slide = partMap(deck({ slides: [{ shapes: [shape], notes: [] }] })).get('ppt/slides/slide1.xml')!;
    const body = partMap(deck({ slides: [{ shapes: [textShape('正文')], notes: [] }] })).get(
      'ppt/slides/slide1.xml',
    )!;

    expect(slide).toContain('<a:spcPct val="100000"/>');
    expect(body).toContain('<a:spcPct val="135000"/>');
  });

  it('applies a solid slide background', () => {
    const parts = partMap(deck({ slides: [{ shapes: [], notes: [], backgroundColor: '102030' }] }));
    expect(parts.get('ppt/slides/slide1.xml')).toContain(
      '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="102030"/>',
    );
  });
});

describe('end to end: HTML → pptx package', () => {
  it('carries a two-grid slide through parse, layout and build', () => {
    const html =
      '<div class="grid" style="position: absolute; width: 45%; height: 60%; left: 5%; top: 20%;">' +
      '<h2>左栏标题</h2><ul><li>要点一</li><li>要点二</li></ul></div>' +
      '<div class="grid" style="position: absolute; width: 45%; height: 60%; left: 52%; top: 20%;' +
      ' background-color: #f5f5f5;"><p>右栏正文</p></div>';

    const regions = parseSlideHtml(html, {
      canvas: { x: 0, y: 0, w: 1, h: 1 },
      content: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
      center: true,
      placeholders: true,
    });
    const shapes = layoutRegions(regions, {
      canvas: CANVAS,
      rootFontSize: 40,
      imageSize: () => null,
    });

    const slide = partMap(
      deck({ slides: [{ shapes, notes: ['讲这一页时慢一点'] }] }),
    ).get('ppt/slides/slide1.xml')!;

    expect(slide).toContain('左栏标题');
    expect(slide).toContain('要点一');
    expect(slide).toContain('右栏正文');
    expect(slide).toContain('<a:buChar char="•"/>'); // 列表项带项目符号
    expect(slide).toContain('F5F5F5'); // 右栏底色
    // 左栏落在画布左半边，右栏在右半边
    const offsets = [...slide.matchAll(/<a:off x="(\d+)"/g)].map((match) => Number(match[1]));
    expect(Math.min(...offsets)).toBeLessThan(12192000 / 2);
    expect(Math.max(...offsets)).toBeGreaterThan(12192000 / 2);
  });
});
