import { MarkdownRenderer } from 'obsidian';
import type { App, Component } from 'obsidian';

/**
 * Obsidian MarkdownRenderer 封装：Markdown → HTML 字符串。
 * 同时承担 grid / split 内部 Markdown 的二次渲染（见管线契约）。
 */
export async function renderMarkdownToHtml(
  app: App,
  markdown: string,
  sourcePath: string,
  component: Component,
): Promise<string> {
  const el = createDiv();
  await MarkdownRenderer.render(app, markdown, el, sourcePath, component);
  return el.innerHTML;
}
