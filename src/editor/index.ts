/**
 * <grid> / <split> 属性自动补全（设置项 autoComplete 控制开关）。
 * 触发逻辑与候选计算在 attributeSuggest.ts（纯函数，有单测），
 * 这里只做 Obsidian EditorSuggest 的外壳。
 */
import { EditorSuggest } from 'obsidian';
import type {
  Editor,
  EditorPosition,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from 'obsidian';
import type RevealPlugin from '../main';
import { getSuggestContext } from './attributeSuggest';
import type { SuggestItem } from './attributeSuggest';

export class GridAttributeSuggest extends EditorSuggest<SuggestItem> {
  private items: SuggestItem[] = [];

  constructor(private plugin: RevealPlugin) {
    super(plugin.app);
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null,
  ): EditorSuggestTriggerInfo | null {
    if (!this.plugin.settings.autoComplete) return null;

    const lineUpToCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
    const context = getSuggestContext(lineUpToCursor);
    if (!context) return null;

    this.items = context.items;
    return {
      start: { line: cursor.line, ch: context.start },
      end: cursor,
      query: context.query,
    };
  }

  getSuggestions(_context: EditorSuggestContext): SuggestItem[] {
    return this.items;
  }

  renderSuggestion(item: SuggestItem, el: HTMLElement): void {
    el.createDiv({ text: item.label, cls: 'reveal-suggest-label' });
    el.createDiv({ text: item.detail, cls: 'reveal-suggest-detail' });
  }

  selectSuggestion(item: SuggestItem): void {
    const context = this.context;
    if (!context) return;
    context.editor.replaceRange(item.insert, context.start, context.end);
    // 光标落到插入内容末尾（属性名补全后正好在引号内）
    context.editor.setCursor({
      line: context.start.line,
      ch: context.start.ch + item.insert.length,
    });
  }
}
