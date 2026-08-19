/**
 * 对话框发给模型的上下文（纯字符串拼装，可单测）。
 *
 * 只给它三样：这一页的源码、课程 CSS 里有哪些 class、以及本插件的语法约定。
 * 不给整篇笔记 —— 几千行既贵又容易让它改错地方。
 */

/**
 * 从课程 CSS 里挑出可用的版式 class 名（`.bar` `.body` …），供模型套用而不是自创。
 * 逐个规则块取「{ 之前的选择器」，选择器列表里的每个 .name 都算 ——
 * `.body,\n.abstract { … }` 这种写法很常见，只认第一个会漏掉一半。
 */
export function collectClassNames(css: string): string[] {
  const names = new Set<string>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const block of withoutComments.split('}')) {
    const selector = block.split('{')[0];
    if (!selector || block.indexOf('{') === -1) continue;
    for (const match of selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) names.add(match[1]);
  }
  return [...names];
}

export const SYSTEM_PROMPT = `你在帮一位老师改一页幻灯片课件。课件用 Obsidian 里的 reveal 插件渲染，语法如下。

**版面**：一页由若干 <grid> 组成，标签上**只写三个属性**：
  dim="宽 高"   画布百分比
  pos="左 上"   画布百分比，也可写 top/bottom/center/bottomright 这类关键字，或负数（距右/下边缘）
  class="…"     版式名，外观全在课程 CSS 里，不要写 style 属性
grid 里面是普通 Markdown。

**示意图**：写 \`\`\`figure 代码块，里面是 JSON 声明，插件会渲染成矢量图。四种 type：
  flow      {"type":"flow","rows":[{"chip":"++b","steps":["先自增 +1","再参与运算"],"note_title":"b = 3 时","note":"c = ++b → 4"}]}
  compare   {"type":"compare","columns":[{"title":"赋值","highlight":true,"lines":["\`a = a + b\`","先算右边"]}]}
  bitfield  {"type":"bitfield","name":"TCON","addr":"0x88","bits":["TF1","TR1","TF0","TR0","IE1","IT1","IE0","IT0"],"highlight":["IT0"],"caption":"本节只用 IT0"}
  timeline  {"type":"timeline","nodes":[{"label":"装初值","sub":"TH0/TL0"}]}
lines 里用反引号包代码，会自动切等宽字体。一列不超过四行，时间线不超过五个节点。

**代码**：\`\`\`c [2,4-6] 标出要讲的行，[1-2|3] 是分步显示。
**公式**：$...$ 行内，$$...$$ 独占一行。
**讲稿**：note: 之后到页尾是演讲者备注，投影时看不见。

**规矩**：
- 图和文字不要讲同一件事。图讲结构，文字只留图上没有的（结论、易错点、考点）。
- 讲稿（note: 之后）除非用户明确要求，一个字都不要动。
- 只改这一页，不要添加分页符（--- 或 xxx）。

**输出**：只输出改好之后这一页的完整 Markdown，不要解释、不要加代码围栏。`;

export function buildUserMessage(options: {
  pageSource: string;
  classNames: string[];
  request: string;
}): string {
  const classes = options.classNames.length
    ? `课程 CSS 里可用的 class：${options.classNames.join('、')}\n\n`
    : '';
  return `${classes}这一页现在的源码：\n\n${options.pageSource}\n\n---\n\n要求：${options.request}`;
}

/** 模型偶尔仍会套一层代码围栏，剥掉 */
export function stripFence(reply: string): string {
  const text = reply.trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}
