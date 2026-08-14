/**
 * URL 路径 ↔ 本地文件路径的互转（跨平台，纯字符串实现，可单测）。
 *
 * Obsidian 的资源 URL 形如 `app://<id>/C:/Users/me/Vault/pic.png`，
 * 路径部分永远是「/ 开头 + 正斜杠」的 URL 形式，即使在 Windows 上也是如此。
 * 直接拿它去比对 `adapter.getBasePath()`（Windows 上是 `C:\Users\me\Vault`）
 * 或丢给 fs，都会失败 —— 盘符前面多一个斜杠、分隔符还反着。
 *
 * ⚠️ 本文件不得 import 'path'：它会被移动端加载，而移动端没有 Node 内置模块。
 */

export type Platform = 'win32' | 'posix';

/** 当前运行平台；测试里显式传参覆盖 */
export function currentPlatform(): Platform {
  return typeof process !== 'undefined' && process.platform === 'win32' ? 'win32' : 'posix';
}

const sepOf = (platform: Platform) => (platform === 'win32' ? '\\' : '/');

/**
 * 规范化：统一分隔符、解掉 `.` 与 `..`、合并重复分隔符。
 * 保留前导分隔符（绝对路径）与 Windows UNC 的双反斜杠。
 */
export function normalize(input: string, platform = currentPlatform()): string {
  const sep = sepOf(platform);
  const unified = platform === 'win32' ? input.replace(/\//g, '\\') : input;

  const isUnc = platform === 'win32' && unified.startsWith('\\\\');
  const isAbsolute = unified.startsWith(sep);

  const parts: string[] = [];
  for (const segment of unified.split(platform === 'win32' ? '\\' : '/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      // 绝对路径不能退到根之上；相对路径保留前导的 ..
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else if (!isAbsolute) parts.push('..');
      continue;
    }
    parts.push(segment);
  }

  const joined = parts.join(sep);
  if (isUnc) return `${sep}${sep}${joined}`;
  if (isAbsolute) return `${sep}${joined}`;
  return joined;
}

/**
 * URL 形式的绝对路径 → 本地路径。
 *   posix: '/Users/me/pic.png'    → '/Users/me/pic.png'
 *   win32: '/C:/Users/me/pic.png' → 'C:\Users\me\pic.png'
 *   win32: '//server/share/a.png' → '\\server\share\a.png'（UNC）
 */
export function urlPathToNative(urlPath: string, platform = currentPlatform()): string {
  if (platform !== 'win32') return normalize(urlPath, 'posix');

  // 盘符前的那个斜杠是 URL 语法的一部分，转本地路径时要去掉
  const withoutLeadingSlash = urlPath.replace(/^\/(?=[a-zA-Z]:)/, '');
  return normalize(withoutLeadingSlash, 'win32');
}

/** 本地路径 → URL 形式（正斜杠、绝对路径带前导斜杠），供拼预览服务器的 /vault 链接 */
export function nativePathToUrl(nativePath: string, platform = currentPlatform()): string {
  if (platform !== 'win32') return nativePath;
  const forward = nativePath.replace(/\\/g, '/');
  return forward.startsWith('/') ? forward : `/${forward}`;
}

/**
 * target 是否位于 base 目录内（含 base 本身）。
 * Windows 的文件系统大小写不敏感，盘符大小写也不固定，故在该平台上忽略大小写。
 */
export function isInsideDir(base: string, target: string, platform = currentPlatform()): boolean {
  const sep = sepOf(platform);
  const normalizedBase = normalize(base, platform).replace(/[\\/]+$/, '');
  const normalizedTarget = normalize(target, platform);

  const [a, b] =
    platform === 'win32'
      ? [normalizedBase.toLowerCase(), normalizedTarget.toLowerCase()]
      : [normalizedBase, normalizedTarget];

  return a === b || b.startsWith(a + sep);
}

/** 绝对路径 → 相对 vault 根目录的路径（正斜杠，Obsidian API 用的形式）；不在库内返回 null */
export function toVaultRelative(
  basePath: string,
  absolutePath: string,
  platform = currentPlatform(),
): string | null {
  if (!isInsideDir(basePath, absolutePath, platform)) return null;
  const sep = sepOf(platform);
  const base = normalize(basePath, platform).replace(/[\\/]+$/, '');
  const target = normalize(absolutePath, platform);
  const relative = target.slice(base.length).replace(/^[\\/]+/, '');
  return relative.split(sep).join('/');
}

/** 拆出目录与主文件名（vault 路径一律用正斜杠） */
function splitNotePath(notePath: string): { dir: string; stem: string } {
  const slash = notePath.lastIndexOf('/');
  const dir = slash >= 0 ? notePath.slice(0, slash + 1) : '';
  const base = slash >= 0 ? notePath.slice(slash + 1) : notePath;
  const dot = base.lastIndexOf('.');
  return { dir, stem: dot > 0 ? base.slice(0, dot) : base };
}

/**
 * 笔记路径 → 同名 CSS 的 vault 路径（同目录、同主名）。
 *   "课程/第1章.md" → "课程/第1章.css"
 */
export function sidecarCssPath(notePath: string): string {
  const { dir, stem } = splitNotePath(notePath);
  return `${dir}${stem}.css`;
}

/**
 * 「这篇笔记专属样式」的候选路径，按优先级排列，取第一个存在的。
 * 覆盖几种常见的库布局，让人不必在 frontmatter 里声明 css:：
 *   1. 笔记同级的同名 css
 *   2. 同名文件夹里（附件与笔记同名文件夹放一起的习惯）
 *   3. assets/<笔记名>/ 里（每篇笔记一个附件夹，很常见）
 *   4. Obsidian 设置里的附件目录（由调用方探测后传入）
 */
export function sidecarCssCandidates(notePath: string, attachmentDir?: string): string[] {
  const { dir, stem } = splitNotePath(notePath);
  const inFolder = (folder: string) => [`${folder}/${stem}.css`, `${folder}/style.css`];

  const candidates = [
    `${dir}${stem}.css`,
    ...inFolder(`${dir}${stem}`),
    ...inFolder(`${dir}assets/${stem}`),
  ];
  if (attachmentDir) candidates.push(...inFolder(attachmentDir.replace(/\/+$/, '')));

  return [...new Set(candidates)];
}
