/**
 * PDF 导出（Task 5.1）：利用 reveal.js 6.x 内置的 ?print-pdf 打印视图，
 * 在系统浏览器中打开后由用户「打印 → 另存为 PDF」。
 */
import { Notice } from 'obsidian';
import type RevealPlugin from '../main';

export function exportPdf(plugin: RevealPlugin): void {
  if (!plugin.server?.running) {
    new Notice('reveal-for-obsidian: preview server is not running, cannot export PDF');
    return;
  }
  const url = `${plugin.serverBase}/reveal.html?print-pdf`;
  window.open(url);
  new Notice('reveal-for-obsidian: print view opened — use Print → Save as PDF in the browser');
}
