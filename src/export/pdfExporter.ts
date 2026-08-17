/**
 * PDF 导出（Task 5.1）：利用 reveal.js 6.x 内置的 ?print-pdf 打印视图，
 * 在系统浏览器中打开后由用户「打印 → 另存为 PDF」。
 */
import { Notice, Platform } from 'obsidian';
import type RevealPlugin from '../main';

export function exportPdf(plugin: RevealPlugin): void {
  if (Platform.isMobile) {
    // 打印视图依赖本地服务器 + 浏览器打印对话框，移动端两者都没有。
    // 也别再指路 HTML 导出：那条路同样只有桌面端能走（依赖 fs）。
    new Notice('reveal-slide-for-obsidian: PDF export needs the desktop app');
    return;
  }
  if (!plugin.server?.running) {
    new Notice('reveal-slide-for-obsidian: preview server is not running, cannot export PDF');
    return;
  }
  const url = `${plugin.server.base}/reveal.html?print-pdf`;
  window.open(url);
  new Notice('reveal-slide-for-obsidian: print view opened — use Print → Save as PDF in the browser');
}
