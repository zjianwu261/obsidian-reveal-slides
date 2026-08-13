import type RevealPlugin from '../main';

export function registerCommands(plugin: RevealPlugin): void {
  plugin.addCommand({
    id: 'show-slide-preview',
    name: 'Show Slide Preview',
    hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'E' }],
    callback: () => {
      void plugin.activateView();
    },
  });

  plugin.addCommand({
    id: 'reload-slide-preview',
    name: 'Reload Slide Preview',
    hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'R' }],
    callback: () => {
      void plugin.reloadPreview();
    },
  });

  plugin.addCommand({
    id: 'start-server',
    name: 'Start Slide Preview Server',
    callback: () => {
      void plugin.startServer();
    },
  });

  plugin.addCommand({
    id: 'stop-server',
    name: 'Stop Slide Preview Server',
    callback: () => {
      void plugin.stopServer();
    },
  });

  plugin.addCommand({
    id: 'toggle-grid-guides',
    name: 'Toggle Grid Guides',
    callback: () => {
      void plugin.toggleGridGuides();
    },
  });

  plugin.addCommand({
    id: 'export-pdf',
    name: 'Export Slides as PDF',
    callback: () => {
      void plugin.exportPdf();
    },
  });

  plugin.addCommand({
    id: 'export-html',
    name: 'Export Slides as HTML',
    callback: () => {
      void plugin.exportHtml();
    },
  });
}
