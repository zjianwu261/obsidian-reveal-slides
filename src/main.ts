import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS } from './types/config';
import type { PluginSettings } from './types/config';
import type { SlideDeck } from './types/slide';
import { RevealSettingTab } from './settings';
import { registerCommands } from './commands';
import { SlidePreviewView } from './views/SlidePreviewView';
import { PreviewServer } from './server/previewServer';
import { PipelineOrchestrator } from './processors';
import { RevealEngine } from './engine/revealEngine';
import { renderMarkdownToHtml } from './engine/renderEngine';
import { debounce } from './utils/debounce';
import { VIEW_TYPE_SLIDE_PREVIEW } from './constants';

function createEmptyDeck(): SlideDeck {
  return {
    title: 'Slide Preview',
    pages: [
      {
        index: 0,
        type: 'horizontal',
        html: '<h2>Empty</h2>',
        notes: [],
        attributes: {},
      },
    ],
    config: {},
    cssVariables: '',
    customCSS: [],
    remoteCSS: [],
  };
}

export default class RevealPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  server: PreviewServer | null = null;
  deck: SlideDeck = createEmptyDeck();
  pipeline = new PipelineOrchestrator();
  revealEngine: RevealEngine = new RevealEngine(this);

  private renderActiveFileDebounced = debounce(() => {
    void this.renderActiveFile();
  }, 300);

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_SLIDE_PREVIEW, (leaf) => new SlidePreviewView(leaf, this));
    this.addSettingTab(new RevealSettingTab(this.app, this));
    registerCommands(this);

    if (this.settings.autoStartServer) {
      await this.startServer();
    }

    // 实时刷新：编辑当前笔记 300ms 防抖后重跑管线
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!this.settings.autoReload) return;
        const activeFile = this.app.workspace.getActiveFile();
        if (file instanceof TFile && activeFile && file.path === activeFile.path) {
          this.renderActiveFileDebounced();
        }
      }),
    );

    // 切换笔记时切换预览内容
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.renderActiveFileDebounced();
      }),
    );

    // 首次渲染
    this.app.workspace.onLayoutReady(() => {
      void this.renderActiveFile();
    });
  }

  async onunload(): Promise<void> {
    await this.stopServer();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SLIDE_PREVIEW);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async startServer(): Promise<void> {
    if (this.server?.running) return;
    this.server = new PreviewServer(this);
    try {
      await this.server.start(this.settings.port);
      this.refreshPreviewViews();
    } catch {
      // Notice 已在 server 内提示
    }
  }

  async stopServer(): Promise<void> {
    if (!this.server) return;
    await this.server.stop();
    this.server = null;
    this.refreshPreviewViews();
  }

  /** 更新当前 deck 并推送到所有预览客户端 */
  updateDeck(deck: SlideDeck): void {
    this.deck = deck;
    if (this.server?.running) {
      this.server.setDeck(deck);
    }
  }

  /** 将当前活动笔记跑管线并推送预览 */
  async renderActiveFile(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file ?? this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      return;
    }

    const markdown = await this.app.vault.cachedRead(file);
    const deck = await this.pipeline.run(markdown, {
      settings: this.settings,
      sourcePath: file.path,
      renderMarkdown: (md, sourcePath) => renderMarkdownToHtml(this.app, md, sourcePath, this),
    });

    if (!deck.title) {
      deck.title = file.basename;
    }
    this.updateDeck(deck);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_SLIDE_PREVIEW);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      if (this.settings.previewMode === 'tab') {
        leaf = workspace.getLeaf('tab');
      } else {
        leaf = workspace.getRightLeaf(false);
      }
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_SLIDE_PREVIEW, active: true });
      }
    }

    if (leaf) {
      await workspace.revealLeaf(leaf);
      await this.renderActiveFile();
    }
  }

  async reloadPreview(): Promise<void> {
    if (!this.server?.running) {
      new Notice('reveal-for-obsidian: preview server is not running');
      return;
    }
    await this.renderActiveFile();
    this.server.broadcast();
  }

  private refreshPreviewViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SLIDE_PREVIEW)) {
      const view = leaf.view;
      if (view instanceof SlidePreviewView) {
        view.refresh();
      }
    }
  }
}
