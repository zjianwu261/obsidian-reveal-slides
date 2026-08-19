/**
 * 斜杠命令（纯数据 + 过滤逻辑，可单测）。
 *
 * 三条，对应一页课件的三样东西：一张画出来的图、一张画出来的示意图、一段文字。
 * 三条都从 note: 讲稿出发 —— 讲稿是你真正想讲的东西，幻灯片上那几行字
 * 反而是从它压缩出来的结果。让模型改压缩结果，只会把话越缩越干。
 */

/** 这条命令走哪条路：改这一页的源码，还是去画一张位图 */
export type ChatCommandMode = 'page' | 'image';

export interface ChatCommand {
  name: string;
  hint: string;
  mode: ChatCommandMode;
  /** 发出去时展开成的整段要求 */
  text: string;
}

/** 三条都得守的一条：讲稿是原材料，不是待改的对象 */
const KEEP_NOTE = 'note: 讲稿本身一个字都不要动。';

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    name: '/fig',
    hint: '按讲稿画一张配图（位图，走画图接口）',
    mode: 'image',
    text:
      '读这一页的 note: 讲稿，为这一页配一张图。' +
      '找一个看得见的比喻来画讲稿讲的那个机制，画面干净、一个主体、大量留白。',
  },
  {
    name: '/svg',
    hint: '按讲稿画一张示意图（矢量，能改能缩放）',
    mode: 'page',
    text:
      '读这一页的 note: 讲稿，按讲稿讲的东西配一张示意图，放进 class="fig" 的 grid。\n' +
      '要求：\n' +
      '1. 图要讲透机制，不是把讲稿的句子搬进方框。画出**为什么是这样**——' +
      '顺序、因果、两种做法差在哪一步。名词罗列和口号式的流程图都不算。\n' +
      '2. 抽象的东西找一个看得见的比喻来画（比如「先取旧值再自增」画成' +
      '柜台先把旧账单递出去、回头才改账本）。比喻要贴住原理，不能只是好看。\n' +
      '3. 图上的字越少越好：一处不超过四五个字，能靠位置、大小、箭头、颜色' +
      '说清楚的就别写字。\n' +
      '4. 四种 ```figure 类型套得上就用；套不上就直接写 ```svg 手绘，' +
      '别把一个不合适的想法硬塞进模板。\n' +
      `5. 图讲结构，正文只留图上没有的结论和易错点，两边不要说同一件事。${KEEP_NOTE}`,
  },
  {
    name: '/abstract',
    hint: '按讲稿总结这一页的正文大纲',
    mode: 'page',
    text:
      '读这一页的 note: 讲稿，把讲稿的内容总结成这一页的正文，' +
      '放进 class="abstract" 的 grid。\n' +
      '两级列表、总行数不超过 10 行，只留结论和要点；' +
      `展开的解释、例子、口头的过渡都留在讲稿里，不要搬到幻灯片上。${KEEP_NOTE}`,
  },
];

/**
 * 输入框内容 → 待选命令；不是以 / 开头就没有候选。
 * 命令名命中的排前面，说明文字命中的排后面 —— 名字是英文（跟 class 同名，
 * 好记也好打），但打「图」「大纲」这样的中文也该找得到，靠的就是说明这一路。
 */
export function matchCommands(input: string): ChatCommand[] {
  if (!input.startsWith('/')) return [];
  const query = input.slice(1).trim().toLowerCase();
  if (!query) return CHAT_COMMANDS;

  const byName = CHAT_COMMANDS.filter((c) => c.name.slice(1).toLowerCase().includes(query));
  const byHint = CHAT_COMMANDS.filter(
    (c) => !byName.includes(c) && c.hint.toLowerCase().includes(query),
  );
  return [...byName, ...byHint];
}

export interface ExpandedRequest {
  mode: ChatCommandMode;
  /** 真正发出去的话 */
  text: string;
  /** 命中的命令，没命中就是 null（界面上回显用） */
  command: ChatCommand | null;
}

/**
 * 输入框里的 `/svg 顺便把比喻换成传送带` → 整段要求。
 *
 * 输入框里只留 `/svg` 这么几个字符，不把整段要求铺进去：
 * 那一大段是给模型看的规矩，铺在眼前只会挡住你自己要补的那句话。
 * 命令后面接着写的字附在末尾 —— 规矩照旧，你的话是补充。
 */
export function expandRequest(input: string): ExpandedRequest {
  const text = input.trim();
  const command = CHAT_COMMANDS.find(
    (item) => text === item.name || text.startsWith(`${item.name} `),
  );
  if (!command) return { mode: 'page', text, command: null };

  const extra = text.slice(command.name.length).trim();
  return {
    mode: command.mode,
    text: extra ? `${command.text}\n\n另外：${extra}` : command.text,
    command,
  };
}
