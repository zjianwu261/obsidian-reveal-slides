/**
 * HTML 独立导出的资源路径处理（纯函数，不依赖 obsidian，可单测）。
 * 预览时 imageProcessor 把 vault 本地资源改写为
 * `{serverBase}/vault/<encodeURIComponent 后的绝对路径>`，
 * 导出时把这些引用收集出来、复制文件并改写为相对路径。
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

/**
 * 扫描 html 中所有 `{serverBase}/vault/...` 引用（去重）。
 * 只匹配引号/空白/右括号前的路径部分；远程 http(s) 图片不经过 /vault 路由，天然不受影响。
 */
export function collectVaultAssetRefs(html: string, serverBase: string): VaultAssetRef[] {
  const pattern = new RegExp(`${escapeRegExp(serverBase)}/vault(/[^"'\\s)]+)`, 'g');
  const refs: VaultAssetRef[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const url = match[0];
    if (seen.has(url)) continue;
    seen.add(url);
    let absolutePath = match[1];
    try {
      absolutePath = decodeURIComponent(absolutePath);
    } catch {
      // 非法编码时按原样使用，复制阶段会因文件不存在而跳过
    }
    refs.push({ url, absolutePath });
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
