/**
 * 对话框顶部那条状态栏的内容（纯计算，可单测）。
 *
 * 面板里最容易让人犯嘀咕的一件事是「它到底要改哪一页」——
 * 尤其笔记切来切去之后。把笔记名、页码、这一页的标题摆在输入框上方，
 * 一眼就知道这句话会落到哪儿。
 */

export interface ChatContext {
  note: string;
  /** 与预览右上角一致的页码，如 2.6 */
  page: string;
  /** 这一页的标题（取第一个 Markdown 标题），没有就空着 */
  title: string;
}

/** 从这一页的源码里取标题：第一行 # 开头的文字 */
export function pageTitle(source: string): string {
  for (const line of source.split('\n')) {
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) return heading[2];
  }
  return '';
}

export function formatContext(context: ChatContext | null): string {
  if (!context) return '还没有可改的页面';
  const parts = [context.note, `第 ${context.page} 页`];
  if (context.title) parts.push(context.title);
  return parts.join('  ·  ');
}
