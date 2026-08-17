/**
 * hash 同步防护（移动端内联预览）。
 *
 * 手机上没有 Node、起不了 HTTP 服务器，预览页是 blob: URL（见 SlidePreviewView）。
 * reveal 的 `hash: true` 会在每次换页后写 URL —— 首页时 hash 为 '/'，它走的是
 *   history.replaceState(null, null, location.pathname + location.search)
 * 而 blob:capacitor://localhost/<id> 的 pathname 是 capacitor://localhost/<id>，
 * 等于要把会话 URL 从 blob: 改成 capacitor:，浏览器直接拦下：
 *   SecurityError: Blocked attempt to use history.replaceState() to change session history URL
 * 报错会被错误浮层糊在幻灯片上，挡住内容。
 *
 * 这类页面本来也没有可分享、可刷新的 URL，hash 对它毫无意义，关掉即可。
 * 反过来，能正常改 URL 的（预览服务器的 http://、导出 HTML 的 file://）保持原样：
 * 深链接和刷新后停在原页都还要靠它。
 */
import type { RevealConfig } from 'reveal.js';

/** 改不了会话 URL 的协议：blob / data 是不透明源，about: 连文档 URL 都不属于自己 */
const UNWRITABLE_PROTOCOLS = ['blob:', 'data:', 'about:'];

/** 当前页面能否改写自己的 URL */
export function canWriteHistory(protocol: string): boolean {
  return !UNWRITABLE_PROTOCOLS.includes(protocol.toLowerCase());
}

export function applyHistoryGuard(config: RevealConfig, protocol: string): void {
  if (!canWriteHistory(protocol)) {
    config.hash = false;
    // hash 关了之后 hashchange 已无意义，一并关掉，免得外部改 URL 时把页面拽走
    config.respondToHashChanges = false;
  }
}
