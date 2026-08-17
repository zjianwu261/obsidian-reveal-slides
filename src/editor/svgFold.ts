/**
 * ```svg 块自动折叠：一段 SVG 动画动辄几十行，摊在笔记里能把正文挤没。
 * 打开笔记（或在同一面板里换笔记）时自动折起，点 ```svg 那行的省略号即可展开。
 *
 * 走 CodeMirror 官方的折叠状态（@codemirror/language），不自绘装饰：
 * 展开手势、gutter 箭头、Obsidian 自己的折叠记忆全部照旧，行为与手动折叠一致。
 * 该模块由 Obsidian 在运行时提供（见 esbuild.config.mjs 的 external 列表）。
 */
import { EditorView, ViewPlugin } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { Editor } from 'obsidian';
import { findSvgFoldRanges } from './svgFoldRanges';
import type { FoldRange } from './svgFoldRanges';

export interface SvgFoldOptions {
  /** 是否自动折叠（读设置，每次现读，改设置立即生效） */
  enabled: () => boolean;
}

/** 该区间当前是否已折叠 */
function isFolded(view: EditorView, range: FoldRange): boolean {
  let found = false;
  foldedRanges(view.state).between(range.from, range.to, (from, to) => {
    if (from === range.from && to === range.to) found = true;
  });
  return found;
}

function svgRanges(view: EditorView): FoldRange[] {
  return findSvgFoldRanges(view.state.doc.toString());
}

/** 折叠所有还没折的 svg 块；本来就全折着则什么都不做，返回是否动过 */
function foldAll(view: EditorView): boolean {
  const effects = svgRanges(view)
    .filter((range) => !isFolded(view, range))
    .map((range) => foldEffect.of(range));
  if (effects.length === 0) return false;
  view.dispatch({ effects });
  return true;
}

/** 展开所有折着的 svg 块，返回是否动过 */
function unfoldAll(view: EditorView): boolean {
  const effects = svgRanges(view)
    .filter((range) => isFolded(view, range))
    .map((range) => unfoldEffect.of(range));
  if (effects.length === 0) return false;
  view.dispatch({ effects });
  return true;
}

/**
 * Obsidian 的 Editor 没在类型里暴露底层的 CM6 EditorView，运行时挂在 .cm 上。
 * instanceof 兜底：哪天这个内部字段变了，命令安静失效即可，不该抛异常。
 */
function toEditorView(editor: Editor): EditorView | null {
  const cm = (editor as unknown as { cm?: unknown }).cm;
  return cm instanceof EditorView ? cm : null;
}

/** 命令用：还有没折的就全折起来，已经全折着则全部展开 */
export function toggleSvgFold(editor: Editor): void {
  const view = toEditorView(editor);
  if (!view) return;
  if (!foldAll(view)) unfoldAll(view);
}

/** 这次改动是不是整篇被换掉了（在同一个面板里切笔记就是这样） */
function replacedWholeDoc(update: ViewUpdate): boolean {
  const before = update.startState.doc.length;
  let whole = false;
  update.changes.iterChanges((fromA, toA) => {
    if (fromA === 0 && toA === before) whole = true;
  });
  return whole;
}

/** 生成注册给 Obsidian 的编辑器扩展 */
export function createSvgFoldExtension(options: SvgFoldOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      private destroyed = false;

      constructor(private view: EditorView) {
        // 新建视图：打开笔记、切换编辑/阅读模式都会走到这里
        this.schedule();
      }

      update(update: ViewUpdate): void {
        // 只在整篇换掉时重折。打字时折就麻烦了：正在编辑的块会当着面合上
        if (update.docChanged && replacedWholeDoc(update)) this.schedule();
      }

      destroy(): void {
        this.destroyed = true;
      }

      /** CM 不允许在 update 期间 dispatch，推到下一拍再折 */
      private schedule(): void {
        window.setTimeout(() => {
          if (this.destroyed || !options.enabled()) return;
          foldAll(this.view);
        }, 0);
      }
    },
  );
}
