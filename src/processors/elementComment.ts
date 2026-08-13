/**
 * Element Comment 处理：
 *   <!-- .element: class="x" style="color:red" --> 作用于紧邻的前一个元素
 *   <!-- .slide: background-color="#fff" -->       收集为当前页 <section> 属性
 *
 * ⚠️ 必须在**渲染之前**把注释换成文本标记：Obsidian 的 MarkdownRenderer 会把
 * HTML 注释整段删掉，等到渲染后再找注释节点，永远找不到 —— 这两个语法会静默失效
 * （和 grid 占位符踩的是同一个坑）。
 *
 * 渲染后再按标记回填属性；标记本身随即从 DOM 中移除。
 * 为兼容会保留注释的渲染器（测试桩、其它宿主），注释节点的老路径也一并保留。
 */
import { normalizeSlideAttributes } from '../transformers/backgroundImage';
import { replaceOutsideCode } from '../utils/codeRanges';

export interface ElementDirective {
  kind: 'element' | 'slide';
  attrs: Record<string, string>;
}

export interface ElementExtractResult {
  /** 注释已换成 ⟦RFO-EL-n⟧ 标记的文本 */
  text: string;
  directives: ElementDirective[];
}

export interface ElementCommentResult {
  html: string;
  slideAttributes: Record<string, string>;
}

const COMMENT_RE = /<!--\s*\.(element|slide):\s*([\s\S]*?)-->/g;
const COMMENT_PATTERN = /^\s*\.(element|slide):\s*(.+?)\s*$/;
const ATTR_PATTERN = /([\w-]+)\s*=\s*"([^"]*)"/g;

const TOKEN_PREFIX = '⟦RFO-EL-';
const TOKEN_CLOSE = '⟧';
const TOKEN_RE = /⟦RFO-EL-(\d+)⟧/g;

const token = (index: number) => `${TOKEN_PREFIX}${index}${TOKEN_CLOSE}`;

/** 解析 key="value" 属性列表 */
function parseAttributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(text)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/**
 * 渲染前：把 .element / .slide 注释换成文本标记。
 * 代码块里的注释是语法示例，原样保留 —— 否则「教怎么写 .element」的那页
 * 会看到示例被替换成标记，属性还套到了代码块上。
 */
export function extractElementComments(markdown: string): ElementExtractResult {
  const directives: ElementDirective[] = [];
  const text = replaceOutsideCode(markdown, COMMENT_RE, (_whole, kind, body) => {
    const index = directives.length;
    directives.push({ kind: kind as 'element' | 'slide', attrs: parseAttributes(body ?? '') });
    return token(index);
  });
  return { text, directives };
}

/** 递归收集注释节点（兼容保留注释的渲染器） */
function collectComments(node: Node, out: Comment[]): void {
  if (node.nodeType === Node.COMMENT_NODE) {
    out.push(node as Comment);
    return;
  }
  Array.from(node.childNodes).forEach((child) => collectComments(child, out));
}

/** 递归收集含标记的文本节点 */
function collectTokenNodes(node: Node, out: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    if ((node.textContent ?? '').includes(TOKEN_PREFIX)) out.push(node as Text);
    return;
  }
  Array.from(node.childNodes).forEach((child) => collectTokenNodes(child, out));
}

/** 元素除了这个节点之外是否只剩空白 */
function isOnlyContent(parent: Element, node: Node, remainingText = ''): boolean {
  return Array.from(parent.childNodes).every(
    (child) =>
      child === node ||
      (child.nodeType === Node.TEXT_NODE && !(child.textContent ?? '').trim()),
  ) && !remainingText.trim();
}

/** class 合并、style 追加、其余 setAttribute */
function applyAttributes(el: Element | null, attrs: Record<string, string>): void {
  if (!el) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') {
      value.split(/\s+/).filter(Boolean).forEach((cls) => el.classList.add(cls));
    } else if (key === 'style') {
      const existing = (el.getAttribute('style') ?? '').trim();
      const sep = existing ? (existing.endsWith(';') ? ' ' : '; ') : '';
      el.setAttribute('style', `${existing}${sep}${value}`);
    } else {
      el.setAttribute(key, value);
    }
  }
}

/**
 * 标记的作用目标：
 *   `<h1>标题⟦tok⟧</h1>`        → 该元素本身（注释写在行尾）
 *   `<p>⟦tok⟧</p>` 独占一段      → 上一个兄弟元素，并删掉这个空段落
 */
function resolveTarget(node: Text, remaining: string): Element | null {
  const parent = node.parentElement;
  if (!parent) return null;

  if (isOnlyContent(parent, node, remaining)) {
    const target = parent.previousElementSibling;
    if (target) {
      parent.remove();
      return target;
    }
    // 没有前一个元素（比如整页只有这条指令）：作用于父元素本身
  }
  return parent.tagName === 'BODY' ? null : parent;
}

/** 渲染后：按标记回填属性，并处理仍以注释形式存在的指令 */
export function applyElementComments(
  html: string,
  directives: ElementDirective[] = [],
): ElementCommentResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const slideAttributes: Record<string, string> = {};

  // 1. 文本标记（Obsidian 走这条）
  const textNodes: Text[] = [];
  collectTokenNodes(doc.body, textNodes);

  for (const node of textNodes) {
    const matches = [...node.data.matchAll(TOKEN_RE)];
    if (matches.length === 0) continue;

    const remaining = node.data.replace(TOKEN_RE, '');
    const applicable = matches
      .map((match) => directives[Number(match[1])])
      .filter((directive): directive is ElementDirective => directive !== undefined);

    const elementAttrs = applicable.filter((d) => d.kind === 'element');
    applicable
      .filter((d) => d.kind === 'slide')
      .forEach((d) => Object.assign(slideAttributes, d.attrs));

    // 先取目标（可能连带删掉空段落），再把标记文字抹掉
    const target = elementAttrs.length > 0 || applicable.length > 0 ? resolveTarget(node, remaining) : null;
    node.data = remaining;
    for (const directive of elementAttrs) applyAttributes(target, directive.attrs);
  }

  // 2. 注释节点（保留注释的渲染器）
  const comments: Comment[] = [];
  collectComments(doc.body, comments);

  for (const comment of comments) {
    const match = COMMENT_PATTERN.exec(comment.data);
    if (!match) continue;
    const attrs = parseAttributes(match[2]);

    const parent = comment.parentElement;
    const wrapper = parent && parent.tagName === 'P' && isOnlyContent(parent, comment) ? parent : null;

    if (match[1] === 'slide') {
      Object.assign(slideAttributes, attrs);
    } else {
      const target = wrapper
        ? wrapper.previousElementSibling
        : (comment.previousElementSibling ??
          (parent && parent.tagName !== 'BODY' ? parent : null));
      applyAttributes(target, attrs);
    }
    comment.remove();
    wrapper?.remove();
  }

  return {
    html: doc.body.innerHTML,
    slideAttributes: normalizeSlideAttributes(slideAttributes),
  };
}

/** 旧接口：仅处理注释节点 */
export function processElementComments(html: string): ElementCommentResult {
  return applyElementComments(html, []);
}
