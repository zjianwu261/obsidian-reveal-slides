import { ItemView } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type RevealPlugin from '../main';
import { VIEW_TYPE_SLIDE_PREVIEW } from '../constants';

export class SlidePreviewView extends ItemView {
  private iframe: HTMLIFrameElement | null = null;

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
        sandbox: 'allow-scripts allow-same-origin',
        style: 'width: 100%; height: 100%; border: 0;',
      },
    });

    this.refresh();
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
  }
}
