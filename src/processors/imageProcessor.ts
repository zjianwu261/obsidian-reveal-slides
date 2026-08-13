/**
 * 渲染后 HTML 的图片/视频/Excalidraw 后处理（纯 DOM 操作，不依赖 obsidian）。
 *
 * 背景：预览 iframe 的 origin 是 http://127.0.0.1:{port}，Obsidian MarkdownRenderer
 * 产出的 app://<vaultId>/<绝对路径>?<mtime> 资源 URL 在 iframe 内无法加载，
 * 这里统一改写为预览服务器的 /vault 路由。
 */
import { VIDEO_EXTENSIONS } from '../constants';

export interface ImageProcessOptions {
  /** 预览服务器根地址（http://127.0.0.1:{port}），缺省时跳过 app:// 改写 */
  serverBase?: string;
  /** 判断 vault 绝对路径对应的文件是否存在（Excalidraw 同名 png 探测用） */
  fileExists?: (absolutePath: string) => boolean;
}

/** app:// URL → 解码后的绝对路径（去掉 query string）；非 app:// 返回 null */
function parseAppUrl(url: string): string | null {
  if (!url.startsWith('app://')) return null;
  const withoutQuery = url.split('?')[0];
  // app://<vaultId>/<绝对路径> → 取 host 之后的部分
  const match = /^app:\/\/[^/]+(\/.*)$/.exec(withoutQuery);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * 绝对路径 → 预览服务器 /vault URL（逐段编码，保留目录分隔符）。
 * 这里的入参来自 app:// URL，本身就是 url 形式（Windows 上形如 /C:/Users/...），
 * 保持原样传给服务器，由服务器负责转成本地路径。
 */
function toVaultUrl(serverBase: string, absolutePath: string): string {
  const encoded = absolutePath.split('/').map(encodeURIComponent).join('/');
  return `${serverBase}/vault${encoded}`;
}

function getExtension(urlOrPath: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(urlOrPath.split('?')[0]);
  return match ? match[1].toLowerCase() : '';
}

/** ![[img.png|800]] / |800x600 的尺寸后缀 */
const SIZE_SUFFIX_RE = /\|\s*(\d+)(?:\s*x\s*(\d+))?\s*$/i;

/**
 * 取 wikilink 的尺寸参数。
 * Obsidian 的 MarkdownRenderer 把 `|800` 放在 alt 文本里，宽高属性挂在外层
 * .image-embed 容器上（靠 Obsidian 自己的 CSS 生效）；iframe 里没有那套 CSS，
 * 必须把尺寸落到 <img>/<video> 本身。
 */
function extractSize(el: Element): { width?: string; height?: string; alt?: string } {
  const embed = el.closest('.image-embed, .internal-embed, .media-embed');
  const containerWidth = embed?.getAttribute('width');
  const containerHeight = embed?.getAttribute('height');
  if (containerWidth) {
    return { width: containerWidth, height: containerHeight ?? undefined };
  }

  const alt = el.getAttribute('alt');
  const match = alt ? SIZE_SUFFIX_RE.exec(alt) : null;
  if (!match) return {};
  return {
    width: match[1],
    height: match[2],
    alt: alt!.replace(SIZE_SUFFIX_RE, '').trim(),
  };
}

/** 把尺寸写到元素本身；alt 去掉 |800 后缀 */
function applySize(el: Element, size: { width?: string; height?: string; alt?: string }): void {
  if (size.width && !el.getAttribute('width')) el.setAttribute('width', size.width);
  if (size.height && !el.getAttribute('height')) el.setAttribute('height', size.height);
  if (size.alt !== undefined) el.setAttribute('alt', size.alt);
}

/** 处理渲染后 HTML：改写 app:// 资源、视频包装、Excalidraw 同名 png 替换 */
export function processImages(html: string, options: ImageProcessOptions = {}): string {
  const { serverBase, fileExists } = options;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const media: { el: Element; attr: 'src' | 'href' }[] = [];
  doc.querySelectorAll('img[src]').forEach((el) => media.push({ el, attr: 'src' }));
  doc.querySelectorAll('a[href]').forEach((el) => media.push({ el, attr: 'href' }));

  for (const { el, attr } of media) {
    const raw = el.getAttribute(attr) ?? '';
    const absolutePath = parseAppUrl(raw);
    const ext = getExtension(absolutePath ?? raw);
    // 有 serverBase 时把 app:// 改写为 /vault 路由，远程 http(s) 原样保留
    const rewritten = absolutePath && serverBase ? toVaultUrl(serverBase, absolutePath) : raw;
    const size = extractSize(el);

    // 视频扩展名 → 包装为 <video controls>
    if (VIDEO_EXTENSIONS.includes(ext)) {
      const video = doc.createElement('video');
      video.setAttribute('controls', '');
      video.setAttribute('src', rewritten);
      applySize(video, size);
      el.replaceWith(video);
      continue;
    }

    // Excalidraw：存在同名 .png 时替换为图片。
    // 限制：真正的 Excalidraw 图形渲染依赖 Excalidraw 插件，
    // 这里仅支持其导出的同名 png 文件，不存在时保留原始链接。
    if (ext === 'excalidraw' && absolutePath) {
      const pngPath = absolutePath.replace(/\.excalidraw$/i, '.png');
      if (serverBase && fileExists?.(pngPath)) {
        const img = doc.createElement('img');
        img.setAttribute('src', toVaultUrl(serverBase, pngPath));
        img.setAttribute('alt', size.alt ?? el.getAttribute('alt') ?? 'excalidraw');
        applySize(img, { ...size, alt: undefined });
        el.replaceWith(img);
      }
      continue;
    }

    if (absolutePath && serverBase) {
      el.setAttribute(attr, rewritten);
    }
    if (el.tagName === 'IMG') applySize(el, size);
  }

  return doc.body.innerHTML;
}
