/**
 * HTML 独立导出的资源路径处理（纯函数，不依赖 obsidian，可单测）。
 * 导出时把 deck 里的 vault 本地资源引用收集出来、复制文件并改写为相对路径。
 *
 * 资源 URL 有两种形态，取决于预览通道，两种都要认：
 *   服务器模式  imageProcessor 改写成 `{serverBase}/vault/<encodeURIComponent 的绝对路径>`
 *   内联模式    保持 Obsidian 原样的 `app://<vaultId>/<绝对路径>?<mtime>`
 * 只认前一种的话，服务器没起来时导出的 HTML 会原样带着 app:// 链接 —— 换台机器就全裂。
 */

/** 一处 vault 资源引用：raw 为 HTML 中出现的原始 URL，absolutePath 为解码后的绝对路径 */
export interface VaultAssetRef {
  url: string;
  absolutePath: string;
}

/** 转义正则特殊字符 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** app://<vaultId>/<绝对路径>?<mtime>（内联模式下资源保持这种形态） */
const APP_URL_RE = /app:\/\/[^/"'\s)]+(\/[^"'\s)]+)/g;

/**
 * 扫描 html 中所有 vault 资源引用（去重）。
 * 只匹配引号/空白/右括号前的路径部分；远程 http(s) 图片两种形态都不沾，天然不受影响。
 * serverBase 缺省时只找 app:// 形态。
 */
export function collectVaultAssetRefs(html: string, serverBase?: string): VaultAssetRef[] {
  const patterns = [APP_URL_RE];
  if (serverBase) {
    patterns.unshift(new RegExp(`${escapeRegExp(serverBase)}/vault(/[^"'\\s)]+)`, 'g'));
  }

  const refs: VaultAssetRef[] = [];
  const seen = new Set<string>();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[0];
      if (seen.has(url)) continue;
      seen.add(url);
      // app:// 形态尾巴上挂着 ?mtime，是缓存参数，不属于路径
      let absolutePath = match[1].split('?')[0];
      try {
        absolutePath = decodeURIComponent(absolutePath);
      } catch {
        // 非法编码时按原样使用，复制阶段会因文件不存在而跳过
      }
      refs.push({ url, absolutePath });
    }
  }
  return refs;
}

/**
 * 把 html 中出现的 vault 资源 URL 按 mapping（原始 URL → 相对路径）改写。
 * 未出现在 mapping 中的引用（如源文件缺失）保持原样。
 */
export function localizeAssetPaths(html: string, mapping: Record<string, string>): string {
  let result = html;
  for (const [url, relative] of Object.entries(mapping)) {
    result = result.split(url).join(relative);
  }
  return result;
}
