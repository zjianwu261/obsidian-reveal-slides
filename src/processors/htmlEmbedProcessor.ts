/**
 * ![[demo.html]] → 填进格子的 <iframe>（网页嵌入）。
 *
 * 幻灯片里要放真能点、能拖的东西（p5 动画、three.js 演示、自己写的小工具）时，
 * 走这条路：把单文件网页跟图片放在一起（assets/<笔记名>/），笔记里照写 wikilink，
 * 不必手写 <iframe src="http://127.0.0.1:3000/vault/...">，也不用记那串绝对路径。
 *
 * ⚠️ 必须在**渲染之前**摘走（同 mathProcessor）：Obsidian 对 .html 这类扩展名
 * 既可能当未知附件不予解析，也可能渲染成一个空的 internal-embed，两种都到不了 iframe。
 * 所以这里只留文本标记，渲染后再换成占位元素。
 *
 * 真正的 <iframe> 由 iframe 客户端（reveal-bundle.ts 的 hydrateHtmlEmbeds）挂上去，
 * 走 Mermaid / Chart.js 那条老路：管线只产出 <div class="rfo-html" data-src>。
 *
 * ⚠️ 嵌入页的脚本是**真的会跑**的（这正是它存在的意义）：它继承预览 iframe 的
 * sandbox 权限，与预览同源。放进去的应当是自己的课件素材，不是随手下载的网页。
 *
 * ⚠️ 本文件不得 import 'path' 等 Node 内置模块：移动端会加载它。
 */
import { replaceOutsideCode } from '../utils/codeRanges';
import { parseAppUrl, toVaultUrl } from './imageProcessor';

export interface HtmlEmbed {
  /** 原始链接文本，用于找不到文件时的提示 */
  linkpath: string;
  /** 解析出的资源 URL（app://…，或已是 http(s)）；null = vault 里没找到 */
  url: string | null;
  /** ![[demo.html|800x450]] 的显式尺寸，缺省则铺满所在容器 */
  width?: number;
  height?: number;
}

export interface HtmlEmbedExtractResult {
  /** 嵌入已换成 ⟦RFO-HTML-n⟧ 标记的文本 */
  text: string;
  embeds: HtmlEmbed[];
}

/** 按链接文本解析 vault 内文件 → 资源 URL；找不到返回 null */
export type ResourceResolver = (linkpath: string) => string | null;

const TOKEN_PREFIX = '⟦RFO-HTML-';
const TOKEN_CLOSE = '⟧';
const TOKEN_RE = /⟦RFO-HTML-(\d+)⟧/g;
const SOLE_TOKEN_RE = /^⟦RFO-HTML-(\d+)⟧$/;

const token = (index: number) => `${TOKEN_PREFIX}${index}${TOKEN_CLOSE}`;

/** ![[路径.html]] / ![[路径.htm|800x450]]，路径里不允许出现 | 与方括号 */
const EMBED_RE = /!\[\[([^[\]|\n]+?\.html?)(?:\|([^[\]\n]*))?\]\]/gi;

/** 尺寸后缀：800 或 800x450（与图片的 ![[x.png|800]] 一致） */
const SIZE_RE = /^\s*(\d+)(?:\s*[x×]\s*(\d+))?\s*$/i;

/**
 * 渲染前：![[x.html]] → 文本标记。
 * 代码块里的写法是教语法用的示例，replaceOutsideCode 会整段跳过。
 */
export function extractHtmlEmbeds(
  markdown: string,
  resolve?: ResourceResolver,
): HtmlEmbedExtractResult {
  if (!resolve || !markdown.includes('![[')) return { text: markdown, embeds: [] };

  const embeds: HtmlEmbed[] = [];
  const text = replaceOutsideCode(markdown, EMBED_RE, (whole, rawPath, rawSize) => {
    const linkpath = (rawPath ?? '').trim();
    if (!linkpath) return whole;

    const size = SIZE_RE.exec(rawSize ?? '');
    embeds.push({
      linkpath,
      url: resolve(linkpath),
      width: size ? Number(size[1]) : undefined,
      height: size?.[2] ? Number(size[2]) : undefined,
    });
    return token(embeds.length - 1);
  });

  return { text, embeds };
}

/** app:// → 预览服务器 /vault 路由；没有 serverBase（内联通道）时保持原样 */
function toEmbedSrc(url: string, serverBase?: string): string {
  const absolutePath = parseAppUrl(url);
  return absolutePath && serverBase ? toVaultUrl(serverBase, absolutePath) : url;
}

/** 标记 → 占位元素；文件不存在时给一句看得见的提示 */
function createEmbedNode(doc: Document, embed: HtmlEmbed, serverBase?: string): Element {
  if (!embed.url) {
    const span = doc.createElement('span');
    span.className = 'rfo-html-missing';
    span.textContent = `⚠️ 找不到网页 "${embed.linkpath}"`;
    return span;
  }

  const box = doc.createElement('div');
  box.className = 'rfo-html';
  box.setAttribute('data-src', toEmbedSrc(embed.url, serverBase));
  // 显式尺寸走内联样式；不写就靠 CSS 铺满格子（同图片的表现）
  if (embed.width) {
    const height = embed.height ? `height:${embed.height}px;` : '';
    box.setAttribute('style', `width:${embed.width}px;${height}`);
  }
  return box;
}

/** 递归收集含标记的文本节点 */
function collectTokenNodes(node: Node, out: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    if ((node.textContent ?? '').includes(TOKEN_PREFIX)) out.push(node as Text);
    return;
  }
  Array.from(node.childNodes).forEach((child) => collectTokenNodes(child, out));
}

/** 渲染后：标记 → <div class="rfo-html"> 占位 */
export function applyHtmlEmbeds(
  html: string,
  embeds: HtmlEmbed[] = [],
  serverBase?: string,
): string {
  if (embeds.length === 0 || !html.includes(TOKEN_PREFIX)) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');

  /*
   * 整段只有一个标记时连 <p> 一起换掉（同 grid 占位符的处理）：
   * 占位是块级 <div>，留在 <p> 里会被浏览器踢出段落；而且它要靠 .grid 的 flex
   * 拉满格子，夹在段落里就只能听自动高度，百分比高度塌成 0 —— 屏幕上是一条缝。
   */
  doc.body.querySelectorAll('p').forEach((p) => {
    const match = SOLE_TOKEN_RE.exec((p.textContent ?? '').trim());
    const embed = match ? embeds[Number(match[1])] : undefined;
    if (embed) p.replaceWith(createEmbedNode(doc, embed, serverBase));
  });

  // 其余位置（正文中间、表格单元格里）就地替换
  const textNodes: Text[] = [];
  collectTokenNodes(doc.body, textNodes);

  for (const node of textNodes) {
    const parent = node.parentNode;
    if (!parent) continue;

    const fragment = doc.createDocumentFragment();
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_RE.exec(node.data)) !== null) {
      const embed = embeds[Number(match[1])];
      if (!embed) continue;
      if (match.index > last) {
        fragment.appendChild(doc.createTextNode(node.data.slice(last, match.index)));
      }
      fragment.appendChild(createEmbedNode(doc, embed, serverBase));
      last = match.index + match[0].length;
    }

    if (last === 0) continue;
    if (last < node.data.length) {
      fragment.appendChild(doc.createTextNode(node.data.slice(last)));
    }
    parent.replaceChild(fragment, node);
  }

  return doc.body.innerHTML;
}
