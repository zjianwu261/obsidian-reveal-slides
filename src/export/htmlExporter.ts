/**
 * HTML 独立导出（Task 5.2）：生成单文件 HTML（reveal 资源全部内联，可离线播放），
 * 并把 deck 引用的 vault 本地图片复制到导出目录的 files/ 子目录、改写为相对路径。
 */
import * as fs from 'fs';
import * as path from 'path';
import { FileSystemAdapter, Notice } from 'obsidian';
import type RevealPlugin from '../main';
import type { SlideDeck } from '../types/slide';
import { renderStandalonePage } from '../engine/templateEngine';
import type { StandaloneAssets } from '../engine/templateEngine';
import { collectVaultAssetRefs, localizeAssetPaths } from './assetLocalizer';
import { INLINE_ASSETS } from '../assets';
import { urlPathToNative } from '../utils/vaultPath';

/** 导出文件名中的非法字符替换为 '-' */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'slides';
}

/**
 * 收集 deck 各页 html 中的 /vault 资源引用，复制到 filesDir，
 * 返回「原始 URL → files/<basename>」映射；重名文件自动加序号。
 */
function collectAndCopyAssets(
  deck: SlideDeck,
  serverBase: string | undefined,
  filesDir: string,
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedNames = new Set<string>();

  for (const page of deck.pages) {
    for (const ref of collectVaultAssetRefs(page.html, serverBase)) {
      // ref.absolutePath 是 url 形式（Windows 上形如 /C:/...），转成本地路径才能读
      const sourcePath = urlPathToNative(ref.absolutePath);
      if (mapping[ref.url] || !fs.existsSync(sourcePath)) continue;

      const base = path.basename(sourcePath);
      const ext = path.extname(base);
      const stem = base.slice(0, base.length - ext.length);
      let name = base;
      let counter = 1;
      while (usedNames.has(name)) {
        name = `${stem}-${counter}${ext}`;
        counter++;
      }
      usedNames.add(name);

      fs.copyFileSync(sourcePath, path.join(filesDir, name));
      mapping[ref.url] = `files/${name}`;
    }
  }
  return mapping;
}

export async function exportHtml(plugin: RevealPlugin): Promise<void> {
  const adapter = plugin.app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    new Notice('reveal-for-obsidian: HTML export requires a filesystem vault');
    return;
  }
  const basePath = adapter.getBasePath();
  // 资源在构建期已内联进 main.js，无需再从插件目录读
  const assets: StandaloneAssets = INLINE_ASSETS;

  // exportDirectory 为 vault 相对路径（默认 /export），统一去掉开头斜杠
  const exportRelative = plugin.settings.exportDirectory.replace(/^[/\\]+/, '') || 'export';
  const exportDir = path.join(basePath, exportRelative);
  const filesDir = path.join(exportDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });

  // 与管线改写图片 URL 时用的是同一个地址（含顺延后的实际端口）
  const serverBase = plugin.serverBase;
  const mapping = collectAndCopyAssets(plugin.deck, serverBase, filesDir);

  // 改写各页 html 中的 vault 资源 URL 为相对路径（不改动内存中的 deck）
  const localizedDeck: SlideDeck = {
    ...plugin.deck,
    pages: plugin.deck.pages.map((page) => ({
      ...page,
      html: localizeAssetPaths(page.html, mapping),
    })),
  };

  const fileName = `${sanitizeFileName(localizedDeck.title || 'slides')}.html`;
  const outputPath = path.join(exportDir, fileName);
  fs.writeFileSync(outputPath, renderStandalonePage(localizedDeck, assets), 'utf8');

  const vaultRelativeOutput = exportRelative ? `${exportRelative}/${fileName}` : fileName;
  new Notice(`reveal-for-obsidian: exported to ${vaultRelativeOutput}`);
}
