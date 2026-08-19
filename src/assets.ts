/**
 * 构建期内联的 iframe 资源。
 *
 * 为什么不放在插件目录里按需读取：Obsidian 的插件安装器（社区列表、BRAT）只下载
 * main.js / manifest.json / styles.css 三个文件，不会带上任何额外目录。
 * 资源若留在磁盘上，用户装完得到的是一个渲染不出任何东西的空壳。
 * 代价是 main.js 体积约 7 MB（reveal + Mermaid + Chart.js + MathJax）。
 */
import { bundleJs, highlightCss, pluginCss, resetCss, revealCss } from 'rfo:assets';
import type { StandaloneAssets } from './engine/templateEngine';

export const INLINE_ASSETS: StandaloneAssets = {
  resetCss,
  revealCss,
  highlightCss,
  pluginCss,
  bundleJs,
};

/** 预览服务器 /assets/<key> 路由表 */
export const ASSET_ROUTES: Record<string, string> = {
  'reset.css': resetCss,
  'reveal.css': revealCss,
  'plugin/highlight/monokai.css': highlightCss,
  'reveal-plugin.css': pluginCss,
  'reveal.bundle.mjs': bundleJs,
};
