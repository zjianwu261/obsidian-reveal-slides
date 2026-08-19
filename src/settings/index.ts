import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type RevealPlugin from '../main';

export class RevealSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: RevealPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;
    const save = () => this.plugin.saveSettings();

    // ── 画布 ──────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Canvas' });

    new Setting(containerEl)
      .setName('Slide size')
      .setDesc('Aspect ratio preset or explicit "WIDTHxHEIGHT" (e.g. 1920x1080)')
      .addDropdown((drop) =>
        drop
          .addOptions({ '16:9': '16:9', '4:3': '4:3', '21:9': '21:9', custom: 'Custom' })
          .setValue(['16:9', '4:3', '21:9'].includes(settings.size) ? settings.size : 'custom')
          .onChange(async (value) => {
            if (value !== 'custom') {
              settings.size = value;
              await save();
              this.display();
            }
          }),
      );

    new Setting(containerEl)
      .setName('Custom width')
      .setDesc('Canvas width in px (0 = auto from size)')
      .addText((text) =>
        text
          .setPlaceholder('1920')
          .setValue(settings.width?.toString() ?? '')
          .onChange(async (value) => {
            const num = Number(value);
            settings.width = value && num > 0 ? num : null;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Custom height')
      .setDesc('Canvas height in px (0 = auto from size)')
      .addText((text) =>
        text
          .setPlaceholder('1080')
          .setValue(settings.height?.toString() ?? '')
          .onChange(async (value) => {
            const num = Number(value);
            settings.height = value && num > 0 ? num : null;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Margin')
      .setDesc('Empty space around the content (0 ~ 1)')
      .addSlider((slider) =>
        slider
          .setLimits(0, 0.3, 0.01)
          .setValue(settings.margin)
          .setDynamicTooltip()
          .onChange(async (value) => {
            settings.margin = value;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Auto font scale')
      .setDesc('Scale the root font size with the canvas width')
      .addToggle((toggle) =>
        toggle.setValue(settings.autoFontScale).onChange(async (value) => {
          settings.autoFontScale = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Font scale')
      .setDesc('Global font size multiplier')
      .addSlider((slider) =>
        slider
          .setLimits(0.5, 2, 0.05)
          .setValue(settings.fontScale)
          .setDynamicTooltip()
          .onChange(async (value) => {
            settings.fontScale = value;
            await save();
          }),
      );

    // ── 分页 ──────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Pagination' });

    new Setting(containerEl)
      .setName('Horizontal separator')
      .setDesc('Slide split marker — a literal line marker (e.g. ---) or a regular expression')
      .addText((text) =>
        text.setValue(settings.separator).onChange(async (value) => {
          settings.separator = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Vertical separator')
      .setDesc('Vertical slide split marker — a literal line marker (e.g. xxx) or a regular expression')
      .addText((text) =>
        text.setValue(settings.verticalSeparator).onChange(async (value) => {
          settings.verticalSeparator = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Heading divider')
      .setDesc('Heading levels that start a new slide, comma-separated (e.g. "1,2"), empty = off')
      .addText((text) =>
        text
          .setPlaceholder('1,2')
          .setValue(settings.headingDivider?.join(',') ?? '')
          .onChange(async (value) => {
            const levels = value
              .split(',')
              .map((v) => Number(v.trim()))
              .filter((v) => v >= 1 && v <= 6);
            settings.headingDivider = levels.length > 0 ? levels : null;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Notes separator')
      .setDesc('Line prefix that starts speaker notes')
      .addText((text) =>
        text.setValue(settings.notesSeparator).onChange(async (value) => {
          settings.notesSeparator = value || 'note:';
          await save();
        }),
      );

    // ── 动画 ──────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Transition' });

    new Setting(containerEl).setName('Transition style').addDropdown((drop) =>
      drop
        .addOptions({
          none: 'None',
          fade: 'Fade',
          slide: 'Slide',
          convex: 'Convex',
          concave: 'Concave',
          zoom: 'Zoom',
        })
        .setValue(settings.transition)
        .onChange(async (value) => {
          settings.transition = value as typeof settings.transition;
          await save();
        }),
    );

    new Setting(containerEl).setName('Transition speed').addDropdown((drop) =>
      drop
        .addOptions({ default: 'Default', fast: 'Fast', slow: 'Slow' })
        .setValue(settings.transitionSpeed)
        .onChange(async (value) => {
          settings.transitionSpeed = value as typeof settings.transitionSpeed;
          await save();
        }),
    );

    // ── 控件 ──────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Controls' });

    new Setting(containerEl).setName('Navigation arrows').addToggle((toggle) =>
      toggle.setValue(settings.controls).onChange(async (value) => {
        settings.controls = value;
        await save();
      }),
    );

    new Setting(containerEl).setName('Progress bar').addToggle((toggle) =>
      toggle.setValue(settings.progress).onChange(async (value) => {
        settings.progress = value;
        await save();
      }),
    );

    new Setting(containerEl).setName('Slide number').addDropdown((drop) =>
      drop
        .addOptions({ off: 'Off', on: 'On', 'c/t': 'Current / Total' })
        .setValue(settings.slideNumber === true ? 'on' : settings.slideNumber === false ? 'off' : 'c/t')
        .onChange(async (value) => {
          settings.slideNumber = value === 'on' ? true : value === 'off' ? false : 'c/t';
          await save();
        }),
    );

    new Setting(containerEl)
      .setName('Center content')
      .setDesc('Vertically center slides')
      .addToggle((toggle) =>
        toggle.setValue(settings.center).onChange(async (value) => {
          settings.center = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Overview mode')
      .setDesc('Press Esc to see a slide overview')
      .addToggle((toggle) =>
        toggle.setValue(settings.enableOverview).onChange(async (value) => {
          settings.enableOverview = value;
          await save();
        }),
      );

    // ── 文档 ──────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Document' });

    new Setting(containerEl)
      .setName('Title')
      .setDesc('Default title for exported presentations')
      .addText((text) =>
        text.setValue(settings.title ?? '').onChange(async (value) => {
          settings.title = value || null;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Local CSS files')
      .setDesc('Vault-relative paths of extra CSS files, comma-separated')
      .addText((text) =>
        text.setValue(settings.css.join(', ')).onChange(async (value) => {
          settings.css = value.split(',').map((v) => v.trim()).filter(Boolean);
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Remote CSS URLs')
      .setDesc('External stylesheets to load, comma-separated')
      .addText((text) =>
        text.setValue(settings.remoteCSS.join(', ')).onChange(async (value) => {
          settings.remoteCSS = value.split(',').map((v) => v.trim()).filter(Boolean);
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Default background')
      .setDesc('CSS color or image URL applied to all slides')
      .addText((text) =>
        text.setValue(settings.bg ?? '').onChange(async (value) => {
          settings.bg = value || null;
          await save();
        }),
      );

    // ── 预览服务器 ─────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Preview Server' });

    new Setting(containerEl)
      .setName('Auto-start server')
      .setDesc('Start the local preview server when the plugin loads')
      .addToggle((toggle) =>
        toggle.setValue(settings.autoStartServer).onChange(async (value) => {
          settings.autoStartServer = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Port')
      .setDesc('Local preview server port (the server restarts when you leave this field)')
      .addText((text) => {
        text.setValue(settings.port.toString()).onChange(async (value) => {
          const num = Number(value);
          if (num >= 1024 && num <= 65535) {
            settings.port = num;
            await save();
          }
        });
        // 逐字符重启会连开好几个端口，改完（失焦 / 回车）再重启
        text.inputEl.addEventListener('change', () => {
          void this.plugin.restartServer();
        });
      });

    // ── 导出 ──────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Export' });

    new Setting(containerEl)
      .setName('Export directory')
      .setDesc('Vault-relative directory for exported files')
      .addText((text) =>
        text.setValue(settings.exportDirectory).onChange(async (value) => {
          settings.exportDirectory = value || '/export';
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('PPTX placeholders')
      .setDesc(
        'Mark blocks PowerPoint cannot hold (mermaid, Chart.js, video) with a grey note box ' +
          'so you know where to drop a screenshot — off drops them silently',
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.pptxPlaceholders).onChange(async (value) => {
          settings.pptxPlaceholders = value;
          await save();
        }),
      );

    // ── 预览 ──────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Preview' });

    new Setting(containerEl)
      .setName('Preview location')
      .setDesc('Where the slide preview opens (applies the next time you open it)')
      .addDropdown((drop) =>
        drop
          .addOptions({
            tab: 'Beside the note (main area)',
            window: 'Separate window',
            sidebar: 'Right sidebar',
          })
          .setValue(settings.previewMode)
          .onChange(async (value) => {
            settings.previewMode = value as typeof settings.previewMode;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Scroll view threshold')
      .setDesc('Width in px below which reveal.js switches to scroll view (0 = disabled)')
      .addText((text) =>
        text.setValue(settings.scrollActivationWidth?.toString() ?? '').onChange(async (value) => {
          const num = Number(value);
          settings.scrollActivationWidth = value && num > 0 ? num : null;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Auto reload')
      .setDesc('Refresh the preview automatically while editing')
      .addToggle((toggle) =>
        toggle.setValue(settings.autoReload).onChange(async (value) => {
          settings.autoReload = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Follow active note')
      .setDesc(
        'Off (default): the preview stays on the note you opened it from — ' +
          'run "Show Slide Preview" on another note to switch it. On: it follows whatever note you open.',
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.followActiveNote).onChange(async (value) => {
          settings.followActiveNote = value;
          await save();
        }),
      );

    containerEl.createEl('h3', { text: 'AI 助手（预览面板下方的对话框）' });

    new Setting(containerEl)
      .setName('启用')
      .setDesc('在预览面板下方显示对话框：说一句话改当前这一页，改动要你确认才写回笔记')
      .addToggle((toggle) =>
        toggle.setValue(settings.aiEnabled).onChange(async (value) => {
          settings.aiEnabled = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('接口地址')
      .setDesc('任何 OpenAI 兼容的 /chat/completions 都行，默认 DeepSeek')
      .addText((text) =>
        text
          .setPlaceholder('https://api.deepseek.com/v1')
          .setValue(settings.aiApiBase)
          .onChange(async (value) => {
            settings.aiApiBase = value.trim();
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('API key')
      .setDesc('存在本库的插件设置里，不会发往接口以外的任何地方')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('sk-…')
          .setValue(settings.aiApiKey)
          .onChange(async (value) => {
            settings.aiApiKey = value.trim();
            await save();
          });
      });

    new Setting(containerEl)
      .setName('提示词文件')
      .setDesc(
        '库内路径。存在就用它，不存在用插件内置的那份。' +
          '命令面板执行 "Open AI Prompt" 会把内置那份写进去并打开，改完立刻生效。',
      )
      .addText((text) =>
        text
          .setPlaceholder('Extra/RevealSlides/提示词.md')
          .setValue(settings.aiPromptPath)
          .onChange(async (value) => {
            settings.aiPromptPath = value.trim();
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('等待上限')
      .setDesc(
        '等模型多久就不等了（秒）。画一张图要吐两三千个 token，' +
          '慢一点的模型三分钟根本写不完 —— 超时了先想想是不是这里太小。',
      )
      .addText((text) =>
        text
          .setPlaceholder('300')
          .setValue(String(settings.aiTimeoutSeconds))
          .onChange(async (value) => {
            const seconds = Number(value.trim());
            // 填了个负数或一句话就当没填：等 0 秒等于按钮直接报错，比默认值还难用
            settings.aiTimeoutSeconds = Number.isFinite(seconds) && seconds >= 10 ? seconds : 300;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('模型')
      .addText((text) =>
        text
          .setPlaceholder('deepseek-v4-flash')
          .setValue(settings.aiModel)
          .onChange(async (value) => {
            settings.aiModel = value.trim();
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Follow cursor')
      .setDesc('Jump the preview to the slide the cursor is on while you edit')
      .addToggle((toggle) =>
        toggle.setValue(settings.syncCursor).onChange(async (value) => {
          settings.syncCursor = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Follow slide')
      .setDesc('Move the editor cursor to the slide you navigate to in the preview')
      .addToggle((toggle) =>
        toggle.setValue(settings.syncSlide).onChange(async (value) => {
          settings.syncSlide = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Show grid guides')
      .setDesc('Outline every <grid> and draw a 10% ruler over the canvas (command: Toggle Grid Guides)')
      .addToggle((toggle) =>
        toggle.setValue(settings.showGridGuides).onChange(async (value) => {
          await this.plugin.setGridGuides(value);
        }),
      );

    new Setting(containerEl)
      .setName('Autocomplete')
      .setDesc('Suggest grid/split attributes while editing')
      .addToggle((toggle) =>
        toggle.setValue(settings.autoComplete).onChange(async (value) => {
          settings.autoComplete = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Fold SVG blocks')
      .setDesc(
        'Collapse ```svg blocks when a note opens — click the fence line to expand ' +
          '(command: Fold / Unfold SVG Code Blocks)',
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.autoFoldSvg).onChange(async (value) => {
          settings.autoFoldSvg = value;
          await save();
        }),
      );
  }
}
