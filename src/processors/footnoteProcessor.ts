/**
 * 行内标记后处理：Emoji 短代码与 Font Awesome 图标（纯 DOM 操作，不依赖 obsidian）。
 * 脚注 [^1] 已由 Obsidian MarkdownRenderer 渲染，无需处理。
 *
 * Font Awesome 仅生成 <i class="fa-*"> 标签，FA 的 CSS 需用户通过
 * frontmatter 的 remoteCSS 自行引入（如 cdn 的 font-awesome 样式表）。
 */

/** 精简 Emoji 短代码映射（覆盖常用项） */
const EMOJI_MAP: Record<string, string> = {
  smile: '😄',
  grin: '😁',
  joy: '😂',
  laughing: '😆',
  wink: '😉',
  blush: '😊',
  thinking: '🤔',
  cry: '😢',
  sob: '😭',
  angry: '😠',
  sunglasses: '😎',
  heart: '❤️',
  orange_heart: '🧡',
  yellow_heart: '💛',
  green_heart: '💚',
  blue_heart: '💙',
  purple_heart: '💜',
  thumbsup: '👍',
  '+1': '👍',
  thumbsdown: '👎',
  '-1': '👎',
  clap: '👏',
  wave: '👋',
  muscle: '💪',
  pray: '🙏',
  ok_hand: '👌',
  point_up: '☝️',
  point_down: '👇',
  point_left: '👈',
  point_right: '👉',
  eyes: '👀',
  tada: '🎉',
  sparkles: '✨',
  fire: '🔥',
  star: '⭐',
  rocket: '🚀',
  warning: '⚠️',
  white_check_mark: '✅',
  heavy_check_mark: '✔️',
  x: '❌',
  bulb: '💡',
  bookmark: '🔖',
  link: '🔗',
  lock: '🔒',
  unlock: '🔓',
  key: '🔑',
  gear: '⚙️',
  wrench: '🔧',
  bug: '🐛',
  zap: '⚡',
  coffee: '☕',
  gift: '🎁',
  memo: '📝',
  pushpin: '📌',
  email: '📧',
  house: '🏠',
  car: '🚗',
  sun_with_face: '🌞',
  moon: '🌙',
  cloud: '☁️',
  rainbow: '🌈',
};

/** :fas_rocket: / :fab_github: 或 :shortcode: */
const SHORTCODE_PATTERN = /:(fas|fab)_([a-z0-9-]+):|:([a-z0-9_+-]+):/g;

/** 收集文本节点，跳过 <pre>/<code>（代码块内容不替换） */
function collectTextNodes(node: Node, out: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node as Text);
    return;
  }
  if (node instanceof Element && (node.tagName === 'PRE' || node.tagName === 'CODE')) return;
  Array.from(node.childNodes).forEach((child) => collectTextNodes(child, out));
}

/** 在单个文本节点内替换短代码，FA 图标生成为 <i> 元素 */
function replaceShortcodes(doc: Document, node: Text): void {
  const text = node.data;
  SHORTCODE_PATTERN.lastIndex = 0;

  const fragment = doc.createDocumentFragment();
  let lastIndex = 0;
  let changed = false;
  let match: RegExpExecArray | null;
  while ((match = SHORTCODE_PATTERN.exec(text)) !== null) {
    const [token, faPrefix, faName] = match;
    let replacement: Node | null = null;
    if (faPrefix) {
      const icon = doc.createElement('i');
      icon.setAttribute('class', `${faPrefix === 'fas' ? 'fa-solid' : 'fa-brands'} fa-${faName}`);
      replacement = icon;
    } else {
      const emoji = EMOJI_MAP[token.slice(1, -1)];
      if (emoji) replacement = doc.createTextNode(emoji);
    }
    if (!replacement) continue;

    changed = true;
    fragment.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
    fragment.appendChild(replacement);
    lastIndex = match.index + token.length;
  }
  if (!changed || !node.parentNode) return;

  fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
  node.parentNode.insertBefore(fragment, node);
  node.parentNode.removeChild(node);
}

export function processInlineMarkup(html: string): string {
  if (!html.includes(':')) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const textNodes: Text[] = [];
  collectTextNodes(doc.body, textNodes);
  for (const node of textNodes) replaceShortcodes(doc, node);
  return doc.body.innerHTML;
}
