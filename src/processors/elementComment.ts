/**
 * Element Comment 处理（DOM 操作，插件侧运行）：
 *   <!-- .element: class="x" style="color:red" --> 作用于紧邻的前一个元素
 *   <!-- .slide: background-color="#fff" -->       收集为当前页 <section> 属性
 * 处理完的注释节点会被移除；其余注释原样保留。
 */
import { normalizeSlideAttributes } from '../transformers/backgroundImage';

export interface ElementCommentResult {
  html: string;
  slideAttributes: Record<string, string>;
}

const COMMENT_PATTERN = /^\s*\.(element|slide):\s*(.+?)\s*$/;
const ATTR_PATTERN = /([\w-]+)\s*=\s*"([^"]*)"/g;

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

/** 递归收集注释节点 */
function collectComments(node: Node, out: Comment[]): void {
  if (node.nodeType === Node.COMMENT_NODE) {
    out.push(node as Comment);
    return;
  }
  Array.from(node.childNodes).forEach((child) => collectComments(child, out));
}

/** 注释是否独占该元素（其余内容仅为空白文本） */
function isOnlyContent(parent: Element, comment: Comment): boolean {
  return Array.from(parent.childNodes).every(
    (child) =>
      child === comment ||
      (child.nodeType === Node.TEXT_NODE && !(child.textContent ?? '').trim()),
  );
}

/** .element 注释的作用目标：紧邻的前一个元素兄弟节点 */
function findElementTarget(comment: Comment, wrapper: Element | null): Element | null {
  const prev = comment.previousElementSibling;
  if (prev) return prev;
  // 注释独占一个 <p>（Markdown 渲染器把注释行包成段落）：作用于 <p> 的前一个元素
  if (wrapper) return wrapper.previousElementSibling;
  // 注释在元素内部末尾（如 "text <!-- .element: -->"）：作用于父元素本身
  const parent = comment.parentElement;
  if (parent && parent.tagName !== 'BODY') return parent;
  return null;
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

export function processElementComments(html: string): ElementCommentResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const slideAttributes: Record<string, string> = {};

  const comments: Comment[] = [];
  collectComments(doc.body, comments);

  for (const comment of comments) {
    // 非 .element/.slide 注释跳过
    const match = COMMENT_PATTERN.exec(comment.data);
    if (!match) continue;
    const attrs = parseAttributes(match[2]);

    // 注释独占 <p> 时，处理后一并移除空段落包装
    const parent = comment.parentElement;
    const wrapper =
      parent && parent.tagName === 'P' && isOnlyContent(parent, comment) ? parent : null;

    if (match[1] === 'slide') {
      Object.assign(slideAttributes, attrs);
    } else {
      applyAttributes(findElementTarget(comment, wrapper), attrs);
    }
    comment.remove();
    wrapper?.remove();
  }

  return {
    html: doc.body.innerHTML,
    slideAttributes: normalizeSlideAttributes(slideAttributes),
  };
}
