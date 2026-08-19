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

export const SYSTEM_PROMPT = `你在帮一位老师改一页幻灯片课件。课件用 Obsidian 里的 reveal 插件渲染。

## 一页由什么组成

一页课件通常只有四种块，每块一个 <grid>：

  标题条   <grid dim="100 10" pos="top" class="bar">      ## 标题
  正文     <grid dim="… …" pos="… …" class="abstract">   要点列表
  配图     <grid dim="… …" pos="… …" class="fig">        \`\`\`figure 声明
  代码     <grid dim="… …" pos="… …" class="code">       \`\`\`c 代码块
  页脚问句 <grid dim="100 10" pos="bottom" class="foot">  问：…

grid 标签上**只写三个属性**：dim="宽 高"、pos="左 上"（画布百分比，也可写
top/bottom/center/bottomright 或负数表示距右/下边缘）、class="…"。
**不要写 style 属性**，外观全在课程 CSS 里。

## 正文（class="abstract"）怎么写

**正文块一律用 class="abstract"。** 课程 CSS 里可能还有个 \`body\`，那是早期版式，
不要再用；改写已有正文时，原来写着 \`body\` 的也换成 \`abstract\`。

把内容整理成一页 PPT 大纲：**简洁、逻辑清晰、列表形式，包含一级和二级列表，
总行数不超过 10 行**。幻灯片上只留结论和要点，展开的话写进 note: 讲稿。

## 配图（class="fig"）怎么写

写 \`\`\`figure 代码块，里面是 JSON 声明，插件渲染成矢量图。四种 type：

  flow      {"type":"flow","rows":[{"chip":"++b","steps":["先自增 +1","再参与运算"],"note_title":"b = 3 时","note":"c = ++b → 4"}]}
  compare   {"type":"compare","columns":[{"title":"赋值","highlight":true,"lines":["\`a = a + b\`","先算右边"]}]}
  bitfield  {"type":"bitfield","name":"TCON","addr":"0x88","bits":["TF1","TR1","TF0","TR0","IE1","IT1","IE0","IT0"],"highlight":["IT0"],"caption":"本节只用 IT0"}
  timeline  {"type":"timeline","nodes":[{"label":"装初值","sub":"TH0/TL0"}]}

lines 里用反引号包代码，会自动切等宽字体。一列不超过四行，时间线不超过五个节点。

**图里的字要和旁边的正文差不多大。** 字的最终大小取决于图被塞进多宽的格子：
图占满整行（dim 宽 ≥ 88）时不用管；跟正文并排（图宽 50~65）时，在声明里加
"textScale": 1.6，否则图里的字会明显比正文小一圈。

## 图和文字怎么分空间

**图比文字更需要横向空间**——flow 是一行一行往右排的，compare 是并排的列，
挤在窄栏里会缩成一团。所以只有两种排法，别自己发明第三种：

  上下排（首选，图是宽扁的 flow / bitfield / timeline 时）
    <grid dim="92 34" pos="4 14" class="fig">        图占满整行
    <grid dim="92 26" pos="4 52" class="abstract">  文字在下

  左右排（compare 这类偏方的图，或者文字较多时）
    <grid dim="58 66" pos="4 15" class="fig">        图占大半，别低于 55
    <grid dim="36 66" pos="62 15" class="abstract">  文字占小半
    并排时图一定要加 "textScale": 1.6

**别把图塞进 36% 这种窄栏再让文字占 64%** —— 那是反过来了。

## 代码（class="code"）怎么写

\`\`\`c [2,4-6] 标出这节要讲的行，其余行自动淡下去；[1-2|3] 是分步显示，
每按一次方向键换一组。代码别超过 15 行，长了就截取要讲的那一段。

## 其他

公式：$...$ 行内，$$...$$ 独占一行。
讲稿：note: 之后到页尾是演讲者备注，投影时看不见。

## 规矩

- 图和文字不要讲同一件事。图讲结构，文字只留图上没有的（结论、易错点、考点）。
- 讲稿（note: 之后）除非用户明确要求，一个字都不要动。
- 只改这一页，不要添加分页符（--- 或 xxx）。
- 沿用用户课程 CSS 里已有的 class，不要自己造新的。

**输出**：只输出改好之后这一页的完整 Markdown，不要解释、不要加代码围栏。`;

export function buildUserMessage(options: {
  pageSource: string;
  classNames: string[];
  request: string;
}): string {
  const classes = options.classNames.length
    ? `课程 CSS 里定义过的 class（仅供参考，正文仍用 abstract）：` +
      `${options.classNames.join('、')}\n\n`
    : '';
  return `${classes}这一页现在的源码：\n\n${options.pageSource}\n\n---\n\n要求：${options.request}`;
}

/** 模型偶尔仍会套一层代码围栏，剥掉 */
export function stripFence(reply: string): string {
  const text = reply.trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}
