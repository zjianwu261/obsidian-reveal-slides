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
import { cssFromFile } from './processors/cssProcessor';
import { RevealEngine } from './engine/revealEngine';
import { renderMarkdownToHtml } from './engine/renderEngine';
import { exportPdf as runPdfExport } from './export/pdfExporter';
import { debounce } from './utils/debounce';
import { lineToPageIndex } from './engine/templateEngine';
import {
  cssRefCandidates,
  sidecarCssCandidates,
  toVaultRelative,
  urlPathToNative,
} from './utils/vaultPath';
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

  /** 当前 deck 用到的外部 CSS 路径：这些文件改了同样要重渲染 */
  private loadedCssPaths = new Set<string>();

  async onload(): Promise<void> {
    // 装了新文件却没重载插件时，Obsidian 会一直跑旧代码而毫无迹象。
    // 把版本与构建时间打出来，排查时一眼可辨。
    console.info(
      `[reveal-for-obsidian] v${this.manifest.version} (build ${__BUILD_STAMP__})`,
    );

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
        if (!(file instanceof TFile)) return;
        // 笔记本身、以及它引用的样式文件（同名 CSS / 主题文件）改动都要重渲染
        const tracked =
          file.path === this.lastMarkdownFile?.path || this.loadedCssPaths.has(file.path);
        if (tracked) {
          this.renderActiveFileDebounced();
        }
      }),
    );

    // 「跟随当前笔记」默认关闭：翻别的笔记查资料时，预览不该被带跑。
    // 开启后两个事件缺一不可 ——
    //   file-open           同一个面板里换笔记（点链接、切标签页、快速切换器）
    //   active-leaf-change  在多个已打开的面板之间切焦点
    // 只监听后者的话，在一个面板里连着看好几篇笔记，预览会一直钉在最初那篇上。
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file?.extension === 'md') this.trackNote(file);
      }),
    );

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file) this.trackNote(view.file);
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

  /** 把预览的渲染对象切到这篇笔记；已经是它、或未开启跟随，则不动 */
  private trackNote(file: TFile): void {
    if (!this.settings.followActiveNote) return;
    if (file.path === this.lastMarkdownFile?.path) return;
    this.lastMarkdownFile = file;
    this.renderActiveFileDebounced();
  }

  async onunload(): Promise<void> {
    // 直接关服务器：卸载时重跑管线、刷新面板都没有意义
    await this.shutdownServer();
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
      await this.switchPreviewChannel();
      return;
    }
    // 动态 import：模块顶层 import 了 http/fs/path，移动端一旦求值就会崩
    const { PreviewServer } = await import('./server/previewServer');
    const server = new PreviewServer(this);
    try {
      await server.start(this.settings.port);
      // 起成功了才认：失败时 this.server 必须保持 null，
      // 否则 serverBase 会给出一个没人监听的地址，资源 URL 全指向空端口
      this.server = server;
    } catch {
      // Notice 已在 server 内提示，退回内联通道
    }
    await this.switchPreviewChannel();
  }

  async stopServer(): Promise<void> {
    if (!this.server) return;
    await this.shutdownServer();
    await this.switchPreviewChannel();
  }

  /** 只关服务器，不动预览（卸载与重启用） */
  private async shutdownServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    await server?.stop();
  }

  /**
   * 预览通道切换（服务器起 / 停）后必须重跑管线：
   * 资源 URL 是按通道决定的 —— 服务器模式改写成 /vault 路由，内联模式保持 app:// 原样。
   * 用错一种，整页图片全裂。先重渲染再刷新面板，页面加载后拿到的才是新 deck。
   */
  private async switchPreviewChannel(): Promise<void> {
    await this.renderActiveFile();
    this.refreshPreviewViews();
  }

  /**
   * 端口变更后重启服务器并重跑管线。
   * 图片 URL 里带着端口（/vault 路由），只重启不重渲染的话旧页面全是裂图。
   */
  async restartServer(): Promise<void> {
    const wasRunning = this.server?.running ?? false;
    await this.shutdownServer();
    if (wasRunning) {
      await this.startServer(); // 内部已重跑管线并刷新预览
      return;
    }
    await this.switchPreviewChannel();
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

  /**
   * 预览服务器根地址；服务器没在跑时为 undefined。
   *
   * 不能在这里编一个占位地址：管线拿它把 app:// 资源改写成 /vault 路由，
   * 而内联通道（移动端始终如此，桌面端服务器起不来时也一样）靠的正是
   * blob 页面与宿主同源、app:// 能直接加载 —— 改写成一个没人监听的端口，
   * 结果就是每张图片都裂。
   */
  get serverBase(): string | undefined {
    return this.server?.running ? this.server.base : undefined;
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
      deck.cssVariables = await this.prependLocalCss(deck, file);
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
  private async prependLocalCss(deck: SlideDeck, note: TFile): Promise<string> {
    const parts: string[] = [];
    this.loadedCssPaths.clear();

    // 1. frontmatter 的 css: / 设置里的 Local CSS files —— 主题一律显式指定，
    //    不做「按目录自动套用」那种隐式行为：改一份文件影响整片笔记，出问题时无从查起
    for (const ref of deck.customCSS) {
      const file = this.resolveCssRef(ref, note);
      if (!file) {
        console.warn(`[reveal-for-obsidian] css file not found: ${ref}`);
        continue;
      }
      parts.push(await this.readCssFile(file));
    }

    // 2. 这篇笔记专属的样式文件（同名 css / 同名文件夹 / 附件夹），存在即加载
    const sidecar = await this.readSidecarCss(note);
    if (sidecar) parts.push(sidecar);

    // 3. 笔记内的 <style>：最靠后，优先级最高
    if (deck.cssVariables) parts.push(deck.cssVariables);
    return parts.join('\n\n');
  }

  /**
   * 找这篇笔记专属的 CSS：按候选顺序取第一个存在的。
   * 附件目录问 Obsidian 要（用户可能改过设置），取不到就只按约定目录找。
   */
  private async readSidecarCss(note: TFile): Promise<string> {
    let attachmentDir: string | undefined;
    try {
      const probe = await this.app.fileManager.getAvailablePathForAttachment('style.css', note.path);
      const slash = probe.lastIndexOf('/');
      if (slash > 0) attachmentDir = probe.slice(0, slash);
    } catch {
      // 拿不到附件目录不影响其余候选
    }

    return this.readFirstCss(sidecarCssCandidates(note.path, attachmentDir));
  }

  /**
   * 按候选顺序取第一份**有内容**的样式。
   * 空文件不算数，继续往下找 —— 否则一个占位用的空 course.css
   * 会把后面同名的 course.md 永久挡住，而且毫无迹象。
   */
  private async readFirstCss(paths: string[]): Promise<string> {
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const css = await this.readCssFile(file);
      if (css.trim()) return css;
    }
    return '';
  }

  /**
   * frontmatter 的 `css:` 条目 → 文件。
   * 先按「相对本篇 / 库内绝对」找，再退回 Obsidian 的链接解析
   * （这样 [[course]] 这种写法也能用，且笔记改名后链接会自动跟随）。
   */
  private resolveCssRef(ref: string, note: TFile): TFile | null {
    for (const path of cssRefCandidates(ref, note.path)) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) return file;
    }

    const linkpath = ref.trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
    return this.app.metadataCache.getFirstLinkpathDest(linkpath, note.path);
  }

  /** 读一个样式文件并登记（登记后它的改动也会触发重渲染）；.md 只取其中的 CSS */
  private async readCssFile(file: TFile): Promise<string> {
    this.loadedCssPaths.add(file.path);
    return cssFromFile(file.path, await this.app.vault.cachedRead(file));
  }

  /** 取候选里第一个真实存在的文件 */
  private findFirstFile(paths: string[]): TFile | null {
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) return file;
    }
    return null;
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

  /**
   * 打开/聚焦预览面板，并**把预览对象绑到当前这篇笔记**。
   * 这是显式动作：不开跟随时，换预览对象就靠在新笔记上再执行一次本命令，
   * 不必关掉面板重开。
   */
  async activateView(): Promise<void> {
    const { workspace } = this.app;

    const active = workspace.getActiveFile();
    const retarget = active?.extension === 'md' && active.path !== this.lastMarkdownFile?.path;
    if (active?.extension === 'md') this.lastMarkdownFile = active;
    if (retarget) new Notice(`reveal-for-obsidian: 预览已切换到「${active!.basename}」`);

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

  /**
   * 打开当前笔记生效的样式文件（就近的那一份），在旁边分栏打开。
   * 样式一旦挪进独立文件就「藏得深」，靠记路径去找太别扭；
   * 这里直接把渲染时实际读到的最后一份（最贴近本篇的那份）打开。
   */
  async openStylesheet(): Promise<void> {
    const paths = [...this.loadedCssPaths];
    const target = paths[paths.length - 1];

    if (!target) {
      new Notice(
        'reveal-for-obsidian: 这篇笔记没有外部样式文件，' +
          '可在 frontmatter 写 css: <主题笔记名> 指定一份',
      );
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(target);
    if (!(file instanceof TFile)) return;
    await this.app.workspace.getLeaf('split', 'vertical').openFile(file);
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

  /**
   * 重新渲染并推送预览。内联通道也要能刷新 —— 移动端根本没有服务器，
   * 早先这里直接以「服务器没跑」告退，于是工具栏的刷新按钮和快捷键
   * 在手机上永远是死的（关掉自动刷新后就再也更新不了预览）。
   */
  async reloadPreview(): Promise<void> {
    await this.renderActiveFile();
    if (this.server?.running) {
      this.server.broadcast();
      return;
    }
    // 内联模式：renderActiveFile 已经把 deck 推过去了，
    // 只有页面还没就绪（加载失败 / 尚未报到）才需要重建 shell
    this.forEachPreview((view) => view.reloadIfNotReady());
  }

  /** 导出 PDF：先重跑管线确保 deck 最新，再打开 ?print-pdf 打印视图 */
  async exportPdf(): Promise<void> {
    await this.renderActiveFile();
    runPdfExport(this);
  }

  /** 导出独立 HTML：先重跑管线确保 deck 最新，再打包单文件导出 */
  async exportHtml(): Promise<void> {
    // htmlExporter 顶层 import 了 fs / path，移动端一求值就抛。
    // 先挡在动态 import 之前 —— 否则这里 reject 出去没人接，用户什么也看不到。
    if (Platform.isMobile) {
      new Notice('reveal-for-obsidian: HTML export needs the desktop app');
      return;
    }
    await this.renderActiveFile();
    try {
      const { exportHtml: runHtmlExport } = await import('./export/htmlExporter');
      await runHtmlExport(this);
    } catch (err) {
      console.error('[reveal-for-obsidian] html export failed', err);
      new Notice(`reveal-for-obsidian: HTML export failed - ${String(err)}`);
    }
  }

  private refreshPreviewViews(): void {
    this.forEachPreview((view) => view.refresh());
  }
}
