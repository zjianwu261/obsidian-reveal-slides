import type RevealPlugin from '../main';
import { toggleSvgFold } from '../editor/svgFold';

export function registerCommands(plugin: RevealPlugin): void {
  plugin.addCommand({
    id: 'show-slide-preview',
    name: 'Show Slide Preview',
    hotkeys: [{ modifiers: ['Alt'], key: 'E' }],
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
    id: 'toggle-immersive-preview',
    name: 'Toggle Immersive Preview',
    callback: () => {
      plugin.toggleImmersive();
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
    id: 'open-stylesheet',
    name: 'Open Slide Stylesheet',
    callback: () => {
      void plugin.openStylesheet();
    },
  });

  plugin.addCommand({
    id: 'toggle-svg-fold',
    name: 'Fold / Unfold SVG Code Blocks',
    editorCallback: (editor) => {
      toggleSvgFold(editor);
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

  plugin.addCommand({
    id: 'export-pptx',
    name: 'Export Slides as PPTX (PowerPoint)',
    callback: () => {
      void plugin.exportPptx();
    },
  });
}
