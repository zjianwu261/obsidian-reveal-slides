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
}
