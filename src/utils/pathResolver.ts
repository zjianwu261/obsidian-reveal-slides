import type { App, TFile } from 'obsidian';

/**
 * 解析 Vault 内资源路径为可访问的 resource path。
 * iframe 预览中本地图片需经预览服务器代理或 resource path 访问。
 */
export function resolveResourcePath(app: App, linkPath: string, sourcePath: string): string | null {
  const file = app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
  if (!file) return null;
  return app.vault.getResourcePath(file as TFile);
}

/** 判断路径是否为远程 URL */
export function isRemoteUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}
