import { ItemView } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type RevealPlugin from '../main';
import { VIEW_TYPE_SLIDE_PREVIEW } from '../constants';

export class SlidePreviewView extends ItemView {
  private iframe: HTMLIFrameElement | null = null;
  private guidesAction: HTMLElement | null = null;

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

    this.guidesAction = this.addAction('grid', 'Toggle grid guides', () => {
      void this.plugin.toggleGridGuides();
    });
    this.syncActions();

    this.refresh();
  }

  /** 工具栏按钮的高亮状态跟随设置（辅助线开着时按钮点亮） */
  syncActions(): void {
    this.guidesAction?.classList.toggle('is-active', this.plugin.settings.showGridGuides);
  }

  /** 设置/刷新 iframe 地址（服务器启动后或端口变更时调用） */
  refresh(): void {
    if (!this.iframe) return;
    if (this.plugin.server?.running) {
      this.iframe.src = this.plugin.server.url;
    } else {
      this.iframe.removeAttribute('src');
      this.iframe.srcdoc =
        '<p style="font-family: sans-serif; padding: 1em;">Preview server is not running. ' +
        'Run the "Start Slide Preview Server" command.</p>';
    }
  }

  async onClose(): Promise<void> {
    this.iframe = null;
    this.guidesAction = null;
  }
}
