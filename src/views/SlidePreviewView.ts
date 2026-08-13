import { ItemView, Notice } from 'obsidian';
import type { Menu } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type RevealPlugin from '../main';
import { createInlinePreviewUrl } from '../preview/inlinePreview';
import { VIEW_TYPE_SLIDE_PREVIEW } from '../constants';

export class SlidePreviewView extends ItemView {
  private iframe: HTMLIFrameElement | null = null;
  private guidesAction: HTMLElement | null = null;
  /** 内联模式（无服务器）下的 blob URL 释放函数 */
  private revokeInlineUrl: (() => void) | null = null;
  /** 内联页面是否已就绪（收到 rfo-ready 后才能推 deck） */
  private inlineReady = false;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: RevealPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SLIDE_PREVIEW;
  }

  getDisplayText(): string {
    return 'Slide Preview';
  }

  getIcon(): string {
    return 'presentation';
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass('reveal-slide-preview-container');

    // 内联模式靠 blob 与宿主同源来加载 app:// 图片，加 sandbox 会变成不透明源，
    // 图片全裂；服务器模式则保持沙箱隔离
    this.iframe = container.createEl('iframe', {
      attr: {
        // allow-popups / allow-popups-to-escape-sandbox：演讲者视图（按 S）要 window.open
        // 一个新窗口。缺了它 window.open 返回 null，而 reveal.js 的 notes 插件是先用后判空
        // （`w.marked = ...` 在 `if (!w)` 之前），会直接抛 TypeError 把整页渲染打断。
        // allow-modals：同一段代码在弹窗被拦时会调 alert()。
        sandbox:
          'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals',
        style: 'width: 100%; height: 100%; border: 0;',
      },
    });

    // 标题栏按钮，从左到右：刷新 / 辅助线 / 导出 PDF / 导出 HTML
    this.addAction('refresh-cw', 'Reload slide preview', () => {
      void this.plugin.reloadPreview();
    });
    this.guidesAction = this.addAction('grid', 'Toggle grid guides', () => {
      void this.plugin.toggleGridGuides();
    });
    this.addAction('printer', 'Export slides as PDF', () => {
      void this.plugin.exportPdf();
    });
    this.addAction('download', 'Export slides as HTML', () => {
      void this.plugin.exportHtml();
    });
    this.syncActions();

    this.refresh();
  }

  /** 工具栏按钮的高亮状态跟随设置（辅助线开着时按钮点亮） */
  syncActions(): void {
    this.guidesAction?.classList.toggle('is-active', this.plugin.settings.showGridGuides);
  }

  /** 面板的「⋯」菜单：导出与辅助线，省得去命令面板翻 */
  onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
    super.onPaneMenu(menu, source);

    menu.addItem((item) =>
      item
        .setTitle('Export slides as PDF')
        .setIcon('printer')
        .onClick(() => {
          void this.plugin.exportPdf();
        }),
    );

    menu.addItem((item) =>
      item
        .setTitle('Export slides as HTML')
        .setIcon('download')
        .onClick(() => {
          void this.plugin.exportHtml();
        }),
    );

    menu.addItem((item) =>
      item
        .setTitle(this.plugin.settings.showGridGuides ? 'Hide grid guides' : 'Show grid guides')
        .setIcon('grid')
        .onClick(() => {
          void this.plugin.toggleGridGuides();
        }),
    );
  }

  /** 设置/刷新预览来源：有服务器走服务器，否则内联（移动端始终走内联） */
  refresh(): void {
    if (!this.iframe) return;

    this.inlineReady = false;
    this.releaseInlineUrl();

    if (this.plugin.server?.running) {
      this.iframe.removeAttribute('sandbox');
      this.iframe.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals',
      );
      this.iframe.src = this.plugin.server.url;
      return;
    }

    // blob 页面与宿主同源，不能再套 sandbox（否则变成不透明源，图片一律加载失败）
    this.iframe.removeAttribute('sandbox');
    void this.loadInlinePreview();
  }

  private async loadInlinePreview(): Promise<void> {
    try {
      const { url, revoke } = await createInlinePreviewUrl(this.app, this.plugin.manifest);
      this.revokeInlineUrl = revoke;
      if (this.iframe) this.iframe.src = url;
    } catch (err) {
      console.error('[reveal-for-obsidian] inline preview failed', err);
      new Notice(`reveal-for-obsidian: could not build the preview - ${String(err)}`);
    }
  }

  private releaseInlineUrl(): void {
    this.revokeInlineUrl?.();
    this.revokeInlineUrl = null;
  }

  /** 内联页面报到后推送当前 deck（服务器模式下由 SSE 负责，不走这里） */
  handleInlineReady(): void {
    this.inlineReady = true;
    this.pushDeck();
  }

  /** 把当前 deck 推给内联页面 */
  pushDeck(): void {
    if (!this.inlineReady) return;
    this.iframe?.contentWindow?.postMessage(
      { type: 'deck', deck: this.plugin.deck },
      '*',
    );
  }

  /** 让内联页面跳到指定页（光标跟随） */
  pushGoto(pageIndex: number): void {
    if (!this.inlineReady) return;
    this.iframe?.contentWindow?.postMessage({ type: 'goto', page: pageIndex }, '*');
  }

  /** 判断消息是否来自本视图的 iframe */
  ownsWindow(source: MessageEventSource | null): boolean {
    return source !== null && source === this.iframe?.contentWindow;
  }

  async onClose(): Promise<void> {
    this.releaseInlineUrl();
    this.iframe = null;
    this.guidesAction = null;
  }
}
