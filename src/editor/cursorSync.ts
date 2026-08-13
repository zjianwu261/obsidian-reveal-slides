/**
 * 光标跟随：编辑器光标所在行 → 预览跳到对应页。
 *
 * 用 CodeMirror 6 的 updateListener 而不是 Obsidian 的 editor-change 事件：
 * 后者只在内容变化时触发，纯移动光标（点击、方向键）收不到。
 */
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export interface CursorSyncOptions {
  /** 是否启用（读设置，每次回调时现读，改设置立即生效） */
  enabled: () => boolean;
  /** 光标所在行（0 基）变化时调用 */
  onLineChange: (line: number) => void;
}

/**
 * 生成注册给 Obsidian 的编辑器扩展。
 * 只在「光标真的换行了」时回调：同一行内左右移动不该反复推送。
 */
export function createCursorSyncExtension(options: CursorSyncOptions): Extension {
  let lastLine = -1;

  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;
    if (!options.enabled()) return;

    const head = update.state.selection.main.head;
    // CodeMirror 的行号是 1 基，统一转成 0 基
    const line = update.state.doc.lineAt(head).number - 1;
    if (line === lastLine) return;

    lastLine = line;
    options.onLineChange(line);
  });
}
