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
import { renderInlineShell } from '../engine/templateEngine';
import { INLINE_ASSETS } from '../assets';

/** 生成内联预览页面的 blob URL；调用方负责在替换/关闭时 revoke */
export function createInlinePreviewUrl(): { url: string; revoke: () => void } {
  const html = renderInlineShell(INLINE_ASSETS);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
