/**
 * PPTX（OOXML / PresentationML）文档生成。纯字符串拼接，不依赖 obsidian / fs，可单测。
 *
 * 生成的是**可编辑**的原生 PowerPoint 对象：文字是文本框、图片是图片、表格是表格，
 * 打开后能直接改，而不是把每页糊成一张图。代价是浏览器才会的效果（mermaid、Chart.js、
 * CSS 动画/滤镜）没法带过去 —— 那些请走 PDF / HTML 导出。
 *
 * 长度单位是 EMU（914400 EMU = 1 英寸）；字号单位是百分之一磅（sz="2000" = 20pt）。
 * 幻灯片高度固定 7.5 英寸（PowerPoint 的标准高度），宽度按画布比例推出来，
 * 于是「画布像素 → EMU」只是一个比例系数，版面比例与预览完全一致。
 */
import type { ZipEntry } from './zipWriter';
import type { PptxShape } from './pptxLayout';
import type { Align, OutlinePara, TableCell, TextRun } from './slideOutline';

/** 幻灯片高度：7.5 英寸，与 PowerPoint 的 16:9 / 4:3 预设一致 */
const SLIDE_HEIGHT_EMU = 6858000;
const EMU_PER_POINT = 12700;

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** 正文行距（千分之一百分比），与 canvas.scss 的 1.35 对齐 */
const LINE_SPACING = '135000';
/**
 * 表格单元格行距：pptxLayout 给每行只留 ROW_HEIGHT(1.9em)，其中 0.4em 归内边距，
 * 正文那档 135% 行距（阅读器还要再乘一次字体自带的 1.2 行高）根本塞不进去，
 * 行只会长不会缩（<a:tr h> 是下限），表格于是长出框外压住下一个块。
 */
const CELL_LINE_SPACING = '100000';

const DEFAULT_TEXT_COLOR = '1A1A1A';
const MONO_FONT = 'Consolas';
const TABLE_BORDER = 'CCCCCC';
const TABLE_HEADER_FILL = 'F0F0F0';

/** 一份要嵌进包里的媒体文件 */
export interface PptxMedia {
  /** 形状里用的 src（与 PptxShape.image.src 对得上） */
  src: string;
  /** 不带点的扩展名，如 png / jpeg */
  ext: string;
  data: Buffer;
}

export interface PptxSlideInput {
  shapes: PptxShape[];
  /** 演讲者备注纯文本（每段一行） */
  notes: string[];
  /** 整页背景色 'RRGGBB' */
  backgroundColor?: string;
  /** 整页背景图（media 里的 src） */
  backgroundImage?: string;
}

export interface PptxDeckInput {
  title: string;
  /** 画布像素尺寸（与预览一致） */
  canvas: { width: number; height: number };
  /** 根字号（px），用于把相对字号换算成磅 */
  rootFontSize: number;
  slides: PptxSlideInput[];
  media: PptxMedia[];
}

/** XML 文本转义；顺手滤掉 XML 1.0 不允许的控制字符（否则 PowerPoint 直接报文件损坏） */
export function xmlEscape(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function rels(items: { id: string; type: string; target: string; external?: boolean }[]): string {
  const body = items
    .map(
      (item) =>
        `<Relationship Id="${item.id}" Type="${item.type}" Target="${xmlEscape(item.target)}"` +
        `${item.external ? ' TargetMode="External"' : ''}/>`,
    )
    .join('');
  return `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

/** 空的 spTree 骨架（母版 / 版式 / 备注页都要有，且必须带这两个必填子元素） */
function emptySpTree(): string {
  return (
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
  );
}

const CLR_MAP =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"' +
  ' accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6"' +
  ' hlink="hlink" folHlink="folHlink"/>';

function theme(name: string): string {
  const accents = ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
  const accentXml = accents
    .map((color, i) => `<a:accent${i + 1}><a:srgbClr val="${color}"/></a:accent${i + 1}>`)
    .join('');
  const line =
    '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
    '<a:prstDash val="solid"/></a:ln>';
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';

  return (
    `${XML_DECL}<a:theme xmlns:a="${NS_A}" name="${xmlEscape(name)}"><a:themeElements>` +
    '<a:clrScheme name="Office">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
    accentXml +
    '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
    '</a:clrScheme>' +
    // 中日韩字体显式写死：Office 默认的 Calibri 不含汉字，不指定 ea 的话
    // 中文会退到系统兜底字体，同一份 deck 换台机器就变样
    '<a:fontScheme name="Office">' +
    '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:minorFont>' +
    '</a:fontScheme>' +
    '<a:fmtScheme name="Office">' +
    `<a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst>` +
    `<a:lnStyleLst>${line.repeat(3)}</a:lnStyleLst>` +
    '<a:effectStyleLst>' +
    '<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3) +
    '</a:effectStyleLst>' +
    `<a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst>` +
    '</a:fmtScheme></a:themeElements></a:theme>'
  );
}

function slideMaster(): string {
  return (
    `${XML_DECL}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    '<p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
    `<p:spTree>${emptySpTree()}</p:spTree></p:cSld>` +
    CLR_MAP +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>' +
    '</p:sldMaster>'
  );
}

function slideLayout(): string {
  return (
    `${XML_DECL}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1">` +
    `<p:cSld name="Blank"><p:spTree>${emptySpTree()}</p:spTree></p:cSld>` +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
  );
}

function notesMaster(): string {
  return (
    `${XML_DECL}<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld><p:spTree>${emptySpTree()}</p:spTree></p:cSld>` +
    CLR_MAP +
    '<p:notesStyle/></p:notesMaster>'
  );
}

function coreProps(title: string): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return (
    `${XML_DECL}<cp:coreProperties` +
    ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${xmlEscape(title)}</dc:title>` +
    '<dc:creator>reveal-slide-for-obsidian</dc:creator>' +
    '<cp:lastModifiedBy>reveal-slide-for-obsidian</cp:lastModifiedBy>' +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

/** 生成上下文：坐标换算 + 媒体关系表 */
class SlideWriter {
  private shapeId = 1;
  /** 本页的关系项（rId1 已被版式占用） */
  private relItems: { id: string; type: string; target: string; external?: boolean }[] = [];
  private mediaRel = new Map<string, string>();

  constructor(
    private emuPerPx: number,
    private rootFontSize: number,
    private mediaFiles: Map<string, string>,
  ) {}

  private nextId(): number {
    return ++this.shapeId;
  }

  /** 画布像素 → EMU */
  emu(px: number): number {
    return Math.round(px * this.emuPerPx);
  }

  /** 相对根字号的倍率 → 百分之一磅（PowerPoint 允许 1pt ~ 4000pt） */
  size(em: number, scale = 1): number {
    const hundredths = Math.round(
      ((em * scale * this.rootFontSize * this.emuPerPx) / EMU_PER_POINT) * 100,
    );
    return Math.min(Math.max(hundredths, 100), 400000);
  }

  /** 取（必要时新建）某个媒体在本页的关系 ID */
  mediaRid(src: string): string | null {
    const file = this.mediaFiles.get(src);
    if (!file) return null;
    const existing = this.mediaRel.get(src);
    if (existing) return existing;
    const id = this.addRel(`${REL}/image`, `../media/${file}`);
    this.mediaRel.set(src, id);
    return id;
  }

  addRel(type: string, target: string, external = false): string {
    const id = `rId${this.relItems.length + 2}`; // rId1 留给版式
    this.relItems.push({ id, type, target, external });
    return id;
  }

  relationships(layoutTarget: string): string {
    return rels([
      { id: 'rId1', type: `${REL}/slideLayout`, target: layoutTarget },
      ...this.relItems,
    ]);
  }

  private xfrm(box: { x: number; y: number; w: number; h: number }): string {
    return (
      `<a:xfrm><a:off x="${this.emu(box.x)}" y="${this.emu(box.y)}"/>` +
      `<a:ext cx="${Math.max(this.emu(box.w), 1)}" cy="${Math.max(this.emu(box.h), 1)}"/></a:xfrm>`
    );
  }

  /** 一段文字的 <a:r>（内含 \n 时拆成 <a:br/>） */
  private run(run: TextRun, mono: boolean, scale: number): string {
    const rPr: string[] = [];
    const attrs = [
      'lang="zh-CN"',
      'altLang="en-US"',
      `sz="${this.size(run.size, scale)}"`,
      run.bold ? 'b="1"' : '',
      run.italic ? 'i="1"' : '',
      run.underline ? 'u="sng"' : '',
      run.strike ? 'strike="sngStrike"' : '',
      'dirty="0"',
    ].filter(Boolean);

    rPr.push(`<a:solidFill><a:srgbClr val="${run.color ?? DEFAULT_TEXT_COLOR}"/></a:solidFill>`);
    if (run.mono || mono) {
      rPr.push(`<a:latin typeface="${MONO_FONT}"/><a:ea typeface="${MONO_FONT}"/>`);
    }
    // 外链要挂到包关系上，PowerPoint 才认得这是超链接
    if (run.link) {
      const id = this.addRel(`${REL}/hyperlink`, run.link, true);
      rPr.push(`<a:hlinkClick r:id="${id}"/>`);
    }
    const properties = `<a:rPr ${attrs.join(' ')}>${rPr.join('')}</a:rPr>`;

    return run.text
      .split('\n')
      // xml:space="preserve" 保住行首缩进（代码块全靠它）
      .map((part) => `<a:r>${properties}<a:t xml:space="preserve">${xmlEscape(part)}</a:t></a:r>`)
      .join('<a:br/>');
  }

  /**
   * @param scale 溢出压缩系数：直接乘进字号里。
   *   写 `<a:normAutofit fontScale="…">` 声明缩放是不够的 —— Keynote / 预览
   *   压根不看这个属性（实测两份只差 fontScale 的文件渲染完全一致），
   *   只有把系数吃进 sz 才是所有阅读器都认的。
   */
  private paragraph(para: OutlinePara, mono: boolean, scale = 1, lineSpacing = LINE_SPACING): string {
    const font = para.size * scale * this.rootFontSize * this.emuPerPx;
    const attrs: string[] = [];
    const props: string[] = [];

    // 列表：悬挂缩进 + 项目符号；引用块借用同一套缩进，但不加符号
    if (para.indent >= 0) {
      const step = Math.round(font * 1.2);
      attrs.push(`marL="${step * (para.indent + 1)}"`, `indent="${-step}"`);
      attrs.push(`lvl="${Math.min(para.indent, 8)}"`);
    } else if (para.quoted) {
      attrs.push(`marL="${Math.round(font)}"`);
    }
    if (para.align) attrs.push(`algn="${para.align}"`);

    props.push(`<a:lnSpc><a:spcPct val="${lineSpacing}"/></a:lnSpc>`);
    if (para.spaceBefore) {
      props.push(`<a:spcBef><a:spcPts val="${Math.round((para.spaceBefore * font * 100) / EMU_PER_POINT)}"/></a:spcBef>`);
    }
    if (para.indent >= 0) {
      props.push(
        para.ordered
          ? '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>'
          : '<a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/>',
      );
    } else {
      props.push('<a:buNone/>');
    }

    const runs = para.runs.map((run) => this.run(run, mono, scale)).join('');
    return `<a:p><a:pPr ${attrs.join(' ')}>${props.join('')}</a:pPr>${runs}</a:p>`;
  }

  private textShape(shape: Extract<PptxShape, { kind: 'text' }>): string {
    const id = this.nextId();
    const fill = shape.fill
      ? `<a:solidFill><a:srgbClr val="${shape.fill}"/></a:solidFill>`
      : '<a:noFill/>';
    const scale = shape.fontScale ?? 1;
    // 有底色时给点内边距，文字不至于贴着边框（字缩了内边距也跟着缩）
    const inset = shape.fill ? Math.round(this.rootFontSize * 0.4 * scale * this.emuPerPx) : 0;
    const body = shape.paragraphs
      .map((para) => this.paragraph(para, shape.mono ?? false, scale))
      .join('');

    return (
      '<p:sp><p:nvSpPr>' +
      `<p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/>` +
      `</p:nvSpPr><p:spPr>${this.xfrm(shape.box)}` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}</p:spPr>` +
      `<p:txBody><a:bodyPr wrap="square" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}"` +
      // 字号已经缩过了，normAutofit 只留给 PowerPoint 里继续加字时接着缩
      ` anchor="${shape.anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`
    );
  }

  private pictureShape(shape: Extract<PptxShape, { kind: 'image' }>): string {
    const rid = this.mediaRid(shape.src);
    if (!rid) return '';
    const id = this.nextId();
    return (
      '<p:pic><p:nvPicPr>' +
      `<p:cNvPr id="${id}" name="Picture ${id}" descr="${xmlEscape(shape.alt)}"/>` +
      '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      `<p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr>${this.xfrm(shape.box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
    );
  }

  private cell(cell: TableCell | undefined, size: number, align: Align | null, scale: number): string {
    const border = `<a:solidFill><a:srgbClr val="${TABLE_BORDER}"/></a:solidFill>`;
    const line = (tag: string): string =>
      `<a:${tag} w="12700" cap="flat" cmpd="sng" algn="ctr">${border}<a:prstDash val="solid"/></a:${tag}>`;
    const fill = cell?.header ? `<a:solidFill><a:srgbClr val="${TABLE_HEADER_FILL}"/></a:solidFill>` : '<a:noFill/>';

    const para: OutlinePara = {
      runs: cell?.runs.length ? cell.runs : [{ text: '', size }],
      size,
      indent: -1,
      ordered: false,
      align: cell?.align ?? align,
    };
    // 单元格内边距跟着字号走：写死的 EMU 在字被压缩后会撑住行高
    //（<a:tr h> 只是下限，行只会长不会缩），表格就会长出框外压到下一个块
    const font = size * scale * this.rootFontSize * this.emuPerPx;
    const marX = Math.round(font * 0.33);
    const marY = Math.round(font * 0.2);
    return (
      `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>` +
      `${this.paragraph(para, false, scale, CELL_LINE_SPACING)}</a:txBody>` +
      `<a:tcPr marL="${marX}" marR="${marX}" marT="${marY}" marB="${marY}" anchor="ctr">` +
      `${line('lnL')}${line('lnR')}${line('lnT')}${line('lnB')}${fill}</a:tcPr></a:tc>`
    );
  }

  private tableShape(shape: Extract<PptxShape, { kind: 'table' }>): string {
    const id = this.nextId();
    const columns = Math.max(...shape.rows.map((row) => row.length), 1);
    const colWidth = Math.round(this.emu(shape.box.w) / columns);
    const rowHeight = Math.round(this.emu(shape.box.h) / shape.rows.length);
    const scale = shape.fontScale ?? 1;

    const grid = `<a:tblGrid>${`<a:gridCol w="${colWidth}"/>`.repeat(columns)}</a:tblGrid>`;
    const rows = shape.rows
      .map((row) => {
        const cells = Array.from({ length: columns }, (_, i) =>
          this.cell(row[i], shape.size, row[i]?.align ?? null, scale),
        ).join('');
        return `<a:tr h="${rowHeight}">${cells}</a:tr>`;
      })
      .join('');

    return (
      '<p:graphicFrame><p:nvGraphicFramePr>' +
      `<p:cNvPr id="${id}" name="Table ${id}"/>` +
      '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/>' +
      `</p:nvGraphicFramePr><p:xfrm><a:off x="${this.emu(shape.box.x)}" y="${this.emu(shape.box.y)}"/>` +
      `<a:ext cx="${this.emu(shape.box.w)}" cy="${this.emu(shape.box.h)}"/></p:xfrm>` +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
      `<a:tbl><a:tblPr firstRow="1"/>${grid}${rows}</a:tbl>` +
      '</a:graphicData></a:graphic></p:graphicFrame>'
    );
  }

  private plainShape(shape: Extract<PptxShape, { kind: 'shape' }>): string {
    const id = this.nextId();
    const fill = shape.fill
      ? `<a:solidFill><a:srgbClr val="${shape.fill}"/></a:solidFill>`
      : '<a:noFill/>';
    return (
      '<p:sp><p:nvSpPr>' +
      `<p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr>${this.xfrm(shape.box)}` +
      `<a:prstGeom prst="${shape.geometry}"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr>` +
      '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>'
    );
  }

  shapeXml(shape: PptxShape): string {
    switch (shape.kind) {
      case 'text':
        return this.textShape(shape);
      case 'image':
        return this.pictureShape(shape);
      case 'table':
        return this.tableShape(shape);
      case 'shape':
        return this.plainShape(shape);
    }
  }

  /** 整页背景（纯色或图片） */
  background(slide: PptxSlideInput): string {
    if (slide.backgroundImage) {
      const rid = this.mediaRid(slide.backgroundImage);
      if (rid) {
        return (
          `<p:bg><p:bgPr><a:blipFill rotWithShape="1"><a:blip r:embed="${rid}"/>` +
          '<a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>'
        );
      }
    }
    if (slide.backgroundColor) {
      return (
        `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${slide.backgroundColor}"/></a:solidFill>` +
        '<a:effectLst/></p:bgPr></p:bg>'
      );
    }
    return '';
  }
}

function notesSlide(lines: string[]): string {
  const paragraphs =
    lines
      .map(
        (line) =>
          '<a:p><a:r><a:rPr lang="zh-CN" altLang="en-US" dirty="0"/>' +
          `<a:t xml:space="preserve">${xmlEscape(line)}</a:t></a:r></a:p>`,
      )
      .join('') || '<a:p/>';

  return (
    `${XML_DECL}<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
    `<p:cSld><p:spTree>${emptySpTree()}` +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 2"/>' +
    '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
    '<p:spPr/>' +
    `<p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>` +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
  );
}

/** 媒体扩展名 → OPC 内容类型（未知扩展一律按二进制流，PowerPoint 会拒绝显示但不至于报损坏） */
function mediaContentType(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'tiff':
      return 'image/tiff';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

/**
 * 组装完整的 .pptx 包，返回 zip 条目列表（`[Content_Types].xml` 在最前，符合 OPC 惯例）。
 */
export function buildPptx(deck: PptxDeckInput): ZipEntry[] {
  const slideWidthEmu = Math.round((SLIDE_HEIGHT_EMU * deck.canvas.width) / deck.canvas.height);
  const emuPerPx = SLIDE_HEIGHT_EMU / deck.canvas.height;

  // 媒体去重后编号：ppt/media/image1.png ...
  const mediaFiles = new Map<string, string>();
  const mediaEntries: ZipEntry[] = [];
  deck.media.forEach((item, i) => {
    if (mediaFiles.has(item.src)) return;
    const file = `image${i + 1}.${item.ext}`;
    mediaFiles.set(item.src, file);
    mediaEntries.push({ path: `ppt/media/${file}`, data: item.data, store: item.ext !== 'svg' });
  });

  const entries: ZipEntry[] = [];
  const slideXml: string[] = [];
  const usedExtensions = new Set<string>();
  for (const item of deck.media) usedExtensions.add(item.ext);

  deck.slides.forEach((slide, i) => {
    const writer = new SlideWriter(emuPerPx, deck.rootFontSize, mediaFiles);
    const background = writer.background(slide);
    const shapes = slide.shapes.map((shape) => writer.shapeXml(shape)).join('');
    const hasNotes = slide.notes.length > 0;

    if (hasNotes) {
      writer.addRel(`${REL}/notesSlide`, `../notesSlides/notesSlide${i + 1}.xml`);
      entries.push({ path: `ppt/notesSlides/notesSlide${i + 1}.xml`, data: notesSlide(slide.notes) });
      entries.push({
        path: `ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`,
        data: rels([
          { id: 'rId1', type: `${REL}/notesMaster`, target: '../notesMasters/notesMaster1.xml' },
          { id: 'rId2', type: `${REL}/slide`, target: `../slides/slide${i + 1}.xml` },
        ]),
      });
    }

    slideXml.push(
      `${XML_DECL}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
        `<p:cSld>${background}<p:spTree>${emptySpTree()}${shapes}</p:spTree></p:cSld>` +
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>',
    );
    entries.push({
      path: `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      // 关系必须在形状写完后才取：超链接/图片是边写边登记的
      data: writer.relationships('../slideLayouts/slideLayout1.xml'),
    });
  });

  slideXml.forEach((xml, i) => entries.push({ path: `ppt/slides/slide${i + 1}.xml`, data: xml }));

  const hasNotes = deck.slides.some((slide) => slide.notes.length > 0);
  const presentationRels = [
    { id: 'rId1', type: `${REL}/slideMaster`, target: 'slideMasters/slideMaster1.xml' },
    ...deck.slides.map((_, i) => ({
      id: `rId${i + 2}`,
      type: `${REL}/slide`,
      target: `slides/slide${i + 1}.xml`,
    })),
  ];
  if (hasNotes) {
    presentationRels.push({
      id: `rId${deck.slides.length + 2}`,
      type: `${REL}/notesMaster`,
      target: 'notesMasters/notesMaster1.xml',
    });
  }

  const presentation =
    `${XML_DECL}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    (hasNotes
      ? `<p:notesMasterIdLst><p:notesMasterId r:id="rId${deck.slides.length + 2}"/></p:notesMasterIdLst>`
      : '') +
    '<p:sldIdLst>' +
    deck.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('') +
    '</p:sldIdLst>' +
    `<p:sldSz cx="${slideWidthEmu}" cy="${SLIDE_HEIGHT_EMU}"/>` +
    '<p:notesSz cx="6858000" cy="9144000"/>' +
    '</p:presentation>';

  const contentTypes =
    `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    [...usedExtensions]
      .map((ext) => `<Default Extension="${ext}" ContentType="${mediaContentType(ext)}"/>`)
      .join('') +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    (hasNotes
      ? '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>' +
        '<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
      : '') +
    deck.slides
      .map(
        (_, i) =>
          `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      )
      .join('') +
    deck.slides
      .map((slide, i) =>
        slide.notes.length > 0
          ? `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
          : '',
      )
      .join('') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';

  const packageParts: ZipEntry[] = [
    { path: '[Content_Types].xml', data: contentTypes },
    {
      path: '_rels/.rels',
      data: rels([
        { id: 'rId1', type: `${REL}/officeDocument`, target: 'ppt/presentation.xml' },
        {
          id: 'rId2',
          type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
          target: 'docProps/core.xml',
        },
      ]),
    },
    { path: 'docProps/core.xml', data: coreProps(deck.title) },
    { path: 'ppt/presentation.xml', data: presentation },
    { path: 'ppt/_rels/presentation.xml.rels', data: rels(presentationRels) },
    { path: 'ppt/slideMasters/slideMaster1.xml', data: slideMaster() },
    {
      path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: rels([
        { id: 'rId1', type: `${REL}/slideLayout`, target: '../slideLayouts/slideLayout1.xml' },
        { id: 'rId2', type: `${REL}/theme`, target: '../theme/theme1.xml' },
      ]),
    },
    { path: 'ppt/slideLayouts/slideLayout1.xml', data: slideLayout() },
    {
      path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: rels([
        { id: 'rId1', type: `${REL}/slideMaster`, target: '../slideMasters/slideMaster1.xml' },
      ]),
    },
    { path: 'ppt/theme/theme1.xml', data: theme('Office') },
  ];

  if (hasNotes) {
    packageParts.push(
      { path: 'ppt/notesMasters/notesMaster1.xml', data: notesMaster() },
      {
        path: 'ppt/notesMasters/_rels/notesMaster1.xml.rels',
        // 备注母版要有自己的主题部件：与幻灯片母版共用一份时 PowerPoint 会判包结构有误
        data: rels([{ id: 'rId1', type: `${REL}/theme`, target: '../theme/theme2.xml' }]),
      },
      { path: 'ppt/theme/theme2.xml', data: theme('Office Notes') },
    );
  }

  return [...packageParts, ...entries, ...mediaEntries];
}

export { SLIDE_HEIGHT_EMU };
