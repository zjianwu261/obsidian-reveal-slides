import { FileSystemAdapter, MarkdownView, Notice, Platform, Plugin, TFile } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS } from './types/config';
import type { PluginSettings } from './types/config';
import type { SlideDeck } from './types/slide';
import type { PreviewServer } from './server/previewServer';
import { RevealSettingTab } from './settings';
import { registerCommands } from './commands';
import { SlidePreviewView } from './views/SlidePreviewView';
import { GridAttributeSuggest } from './editor';
import { createCursorSyncExtension } from './editor/cursorSync';
import { PipelineOrchestrator } from './processors';
import { RevealEngine } from './engine/revealEngine';
import { renderMarkdownToHtml } from './engine/renderEngine';
import { exportPdf as runPdfExport } from './export/pdfExporter';
import { debounce } from './utils/debounce';
import { lineToPageIndex } from './engine/templateEngine';
import { toVaultRelative, urlPathToNative } from './utils/vaultPath';
import { VIEW_TYPE_SLIDE_PREVIEW } from './constants';

function createEmptyDeck(message = 'Empty'): SlideDeck {
  return {
    title: 'Slide Preview',
    pages: [
      {
        index: 0,
        type: 'horizontal',
        sourceLine: 0,
        html: `<h2>${message}</h2>`,
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

  /** 最近活动的 Markdown 文件（预览面板获得焦点后仍跟踪原笔记） */
  private lastMarkdownFile: TFile | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_SLIDE_PREVIEW, (leaf) => new SlidePreviewView(leaf, this));
    this.addSettingTab(new RevealSettingTab(this.app, this));
    this.registerEditorSuggest(new GridAttributeSuggest(this));
    this.registerEditorExtension(
      createCursorSyncExtension({
        enabled: () => this.settings.syncCursor,
        onLineChange: (line) => this.syncPreviewToLine(line),
      }),
    );
    registerCommands(this);

    if (this.settings.autoStartServer) {
      await this.startServer();
    }

    // 实时刷新：编辑当前笔记 300ms 防抖后重跑管线
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!this.settings.autoReload) return;
        if (
          file instanceof TFile &&
          this.lastMarkdownFile &&
          file.path === this.lastMarkdownFile.path
        ) {
          this.renderActiveFileDebounced();
        }
      }),
    );

    // 切换笔记时切换预览内容（仅在活动叶是 Markdown 视图时更新跟踪目标，
    // 避免预览面板获得焦点后丢失渲染对象）
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file) {
          const changed = view.file.path !== this.lastMarkdownFile?.path;
          this.lastMarkdownFile = view.file;
          if (changed) this.renderActiveFileDebounced();
        }
      }),
    );

    // 内联预览页面加载完会报到，收到后把当前 deck 推过去
    this.registerDomEvent(window, 'message', (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type !== 'rfo-ready') return;
      this.forEachPreview((view) => {
        if (view.ownsWindow(event.source)) view.handleInlineReady();
      });
    });

    // 首次渲染
    this.app.workspace.onLayoutReady(() => {
      const file = this.app.workspace.getActiveFile();
      if (file?.extension === 'md') {
        this.lastMarkdownFile = file;
      }
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
    // 移动端没有 Node，起不了 HTTP 服务器：预览走内联通道（见 inlinePreview.ts）
    if (Platform.isMobile) {
      this.refreshPreviewViews();
      return;
    }
    // 动态 import：模块顶层 import 了 http/fs/path，移动端一旦求值就会崩
    const { PreviewServer } = await import('./server/previewServer');
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

  /**
   * 端口变更后重启服务器并重跑管线。
   * 图片 URL 里带着端口（/vault 路由），只重启不重渲染的话旧页面全是裂图。
   */
  async restartServer(): Promise<void> {
    const wasRunning = this.server?.running ?? false;
    await this.stopServer();
    if (!wasRunning) return;
    await this.startServer();
    await this.renderActiveFile();
  }

  /**
   * 光标跟随：把光标所在行换算成页序号推给预览。
   * 只在预览跟踪的就是当前编辑的这篇笔记时才推，避免在别的笔记里乱翻页。
   */
  private syncPreviewToLine(line: number): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file || view.file.path !== this.lastMarkdownFile?.path) return;

    const page = lineToPageIndex(this.deck, line);
    if (this.server?.running) {
      this.server.gotoPage(page);
      return;
    }
    this.forEachPreview((preview) => preview.pushGoto(page));
  }

  /** 预览服务器根地址（服务器未运行时按设置端口给出占位值） */
  get serverBase(): string {
    return this.server?.running ? this.server.base : `http://127.0.0.1:${this.settings.port}`;
  }

  /** 更新当前 deck 并推送到所有预览客户端 */
  updateDeck(deck: SlideDeck): void {
    this.deck = deck;
    if (this.server?.running) {
      this.server.setDeck(deck);
      return;
    }
    // 内联模式：直接 postMessage 给各预览面板
    this.forEachPreview((view) => view.pushDeck());
  }

  /** 将当前跟踪的笔记跑管线并推送预览 */
  async renderActiveFile(): Promise<void> {
    // 兼容启动时序：尚无跟踪目标时尝试取当前活动文件
    if (!this.lastMarkdownFile) {
      const active = this.app.workspace.getActiveFile();
      if (active?.extension === 'md') this.lastMarkdownFile = active;
    }

    const file = this.lastMarkdownFile;
    if (!file || file.extension !== 'md') {
      this.updateDeck(createEmptyDeck('Open a markdown note to preview slides'));
      return;
    }

    try {
      const markdown = await this.app.vault.cachedRead(file);
      const deck = await this.pipeline.run(markdown, {
        settings: this.settings,
        sourcePath: file.path,
        // 端口可能因占用而顺延，必须用实际监听的端口，否则图片 URL 指向空端口
        serverBase: this.serverBase,
        fileExists: (absolutePath) => this.vaultFileExists(absolutePath),
        readNote: (linkpath) => this.readNoteByLinkpath(linkpath, file.path),
        renderMarkdown: (md, sourcePath) => renderMarkdownToHtml(this.app, md, sourcePath, this),
      });

      if (!deck.title) {
        deck.title = file.basename;
      }
      deck.cssVariables = await this.prependLocalCss(deck);
      this.updateDeck(deck);
    } catch (err) {
      // 管线任何一步失败都不能静默——否则预览永远停留在旧内容
      console.error('[reveal-for-obsidian] pipeline failed', err);
      new Notice(`reveal-for-obsidian: render failed - ${String(err)}`);
    }
  }

  /**
   * 读取 css 配置指向的 vault 内 CSS 文件，拼在文档级 CSS 之前
   * （笔记里的 <style> 块优先级更高，放在后面）。读不到的路径跳过。
   */
  private async prependLocalCss(deck: SlideDeck): Promise<string> {
    const parts: string[] = [];
    for (const relative of deck.customCSS) {
      const path = relative.replace(/^[/\\]+/, '');
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        console.warn(`[reveal-for-obsidian] css file not found: ${relative}`);
        continue;
      }
      parts.push(await this.app.vault.cachedRead(file));
    }
    if (deck.cssVariables) parts.push(deck.cssVariables);
    return parts.join('\n\n');
  }

  /** 按 Obsidian 链接路径解析笔记并读取内容（```slide 嵌入用），不存在返回 null */
  private async readNoteByLinkpath(linkpath: string, sourcePath: string): Promise<string | null> {
    const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    if (!dest) return null;
    return this.app.vault.cachedRead(dest);
  }

  /** 判断 vault 绝对路径对应的文件是否存在（imageProcessor 的 Excalidraw 同名 png 探测用） */
  private vaultFileExists(absolutePath: string): boolean {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return false;
    // 入参是 app:// URL 里的路径（url 形式），Windows 上要先转成本地路径再比对
    const relative = toVaultRelative(adapter.getBasePath(), urlPathToNative(absolutePath));
    return relative !== null && this.app.vault.getAbstractFileByPath(relative) !== null;
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_SLIDE_PREVIEW);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = this.createPreviewLeaf();
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_SLIDE_PREVIEW, active: true });
      }
    }

    if (leaf) {
      await workspace.revealLeaf(leaf);
      await this.renderActiveFile();
    }
  }

  /** 按设置创建预览面板所在的 leaf */
  private createPreviewLeaf(): WorkspaceLeaf | null {
    const { workspace } = this.app;
    switch (this.settings.previewMode) {
      case 'sidebar':
        return workspace.getRightLeaf(false);
      case 'window':
        return workspace.openPopoutLeaf();
      case 'tab':
      default:
        // 主编辑区右侧分栏：笔记与预览并排，同 advanced-slides 的默认行为
        return workspace.getLeaf('split', 'vertical');
    }
  }

  /** 设置版面辅助线（grid 边框 + 画布 10% 标尺）并立即推送到预览 */
  async setGridGuides(value: boolean): Promise<void> {
    this.settings.showGridGuides = value;
    await this.saveSettings();
    await this.renderActiveFile();
    this.syncPreviewActions();
  }

  /** 切换版面辅助线（命令面板 / 预览面板工具栏按钮） */
  async toggleGridGuides(): Promise<void> {
    await this.setGridGuides(!this.settings.showGridGuides);
    new Notice(
      this.settings.showGridGuides
        ? 'reveal-for-obsidian: grid guides on'
        : 'reveal-for-obsidian: grid guides off',
    );
  }

  /** 同步各预览面板工具栏按钮的状态（不重载 iframe） */
  private syncPreviewActions(): void {
    this.forEachPreview((view) => view.syncActions());
  }

  /** 遍历所有预览面板 */
  private forEachPreview(fn: (view: SlidePreviewView) => void): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SLIDE_PREVIEW)) {
      if (leaf.view instanceof SlidePreviewView) fn(leaf.view);
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

  /** 导出 PDF：先重跑管线确保 deck 最新，再打开 ?print-pdf 打印视图 */
  async exportPdf(): Promise<void> {
    await this.renderActiveFile();
    runPdfExport(this);
  }

  /** 导出独立 HTML：先重跑管线确保 deck 最新，再打包单文件导出 */
  async exportHtml(): Promise<void> {
    await this.renderActiveFile();
    const { exportHtml: runHtmlExport } = await import('./export/htmlExporter');
    await runHtmlExport(this);
  }

  private refreshPreviewViews(): void {
    this.forEachPreview((view) => view.refresh());
  }
}
