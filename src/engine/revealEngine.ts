import type RevealPlugin from '../main';
import type { SlideDeck } from '../types/slide';

/**
 * reveal.js 引擎的插件侧门面。
 * 实际初始化在预览 iframe 内由 reveal.bundle.mjs 完成
 * （iframe 通过 SSE 监听 /deck 变化自动重渲染），
 * 这里只负责把 SlideDeck 推送到预览服务器。
 */
export class RevealEngine {
  constructor(private plugin: RevealPlugin) {}

  async init(deck: SlideDeck): Promise<void> {
    this.plugin.updateDeck(deck);
  }

  async reload(deck: SlideDeck): Promise<void> {
    this.plugin.updateDeck(deck);
  }

  destroy(): void {
    // 服务器生命周期由插件统一管理，这里无需操作
  }
}
