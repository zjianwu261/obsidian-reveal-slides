/**
 * 内联预览：不依赖本地 HTTP 服务器的渲染通道。
 *
 * 移动端 Obsidian 没有 Node，起不了服务器，只能把 reveal 运行时和样式
 * 全部内联成一个页面，用 blob: URL 挂到 iframe 上（blob 与宿主同源，
 * Obsidian 的 app:// / capacitor:// 图片资源因此仍能加载）。
 * 之后每次 deck 更新只 postMessage 推数据，不重建页面 —— bundle 有好几 MB，
 * 每次编辑都重灌一遍手机撑不住。
 *
 * 桌面端在服务器起不来时（端口全被占等）也会退到这条路。
 */
import { normalizePath } from 'obsidian';
import type { App, PluginManifest } from 'obsidian';
import { renderInlineShell } from '../engine/templateEngine';
import type { StandaloneAssets } from '../engine/templateEngine';

/**
 * 从插件目录读取内联所需的资源。
 * 走 vault adapter 而不是 fs：移动端没有 fs，而插件目录本身就在库内。
 */
export async function readInlineAssets(
  app: App,
  manifest: PluginManifest,
): Promise<StandaloneAssets> {
  const dir = manifest.dir ?? '';
  const read = (relative: string) => app.vault.adapter.read(normalizePath(`${dir}/${relative}`));

  const [resetCss, revealCss, highlightCss, pluginCss, bundleJs] = await Promise.all([
    read('assets/reset.css'),
    read('assets/reveal.css'),
    read('assets/plugin/highlight/monokai.css'),
    read('assets/reveal-plugin.css'),
    read('assets/reveal.bundle.mjs'),
  ]);

  return { resetCss, revealCss, highlightCss, pluginCss, bundleJs };
}

/** 生成内联预览页面的 blob URL；调用方负责在替换/关闭时 revoke */
export async function createInlinePreviewUrl(
  app: App,
  manifest: PluginManifest,
): Promise<{ url: string; revoke: () => void }> {
  const assets = await readInlineAssets(app, manifest);
  const html = renderInlineShell(assets);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
