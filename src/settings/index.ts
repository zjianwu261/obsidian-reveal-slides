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
      .setDesc('Regular expression that splits horizontal slides')
      .addText((text) =>
        text.setValue(settings.separator).onChange(async (value) => {
          settings.separator = value;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName('Vertical separator')
      .setDesc('Regular expression that splits vertical slides')
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
      .setDesc('Local preview server port (restart the server to apply)')
      .addText((text) =>
        text.setValue(settings.port.toString()).onChange(async (value) => {
          const num = Number(value);
          if (num >= 1024 && num <= 65535) {
            settings.port = num;
            await save();
          }
        }),
      );

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

    // ── 预览 ──────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Preview' });

    new Setting(containerEl)
      .setName('Preview location')
      .setDesc('Open the slide preview in a tab or the sidebar')
      .addDropdown((drop) =>
        drop
          .addOptions({ sidebar: 'Sidebar', tab: 'Tab' })
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
      .setName('Autocomplete')
      .setDesc('Suggest grid/split attributes while editing')
      .addToggle((toggle) =>
        toggle.setValue(settings.autoComplete).onChange(async (value) => {
          settings.autoComplete = value;
          await save();
        }),
      );
  }
}
