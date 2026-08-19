/**
 * 斜杠命令（纯数据 + 过滤逻辑，可单测）。
 *
 * 同样几句话每页都要说一遍：「给这页配图」「把正文整理成大纲」。
 * 打个 / 挑一条，省得每次重敲，也顺带把说法固定下来 —— 提法一致，模型的表现才稳定。
 */

export interface ChatCommand {
  name: string;
  hint: string;
  /** 选中后填进输入框的话 */
  text: string;
}

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    name: '/图',
    hint: '按这一页的文字配一张图，并精简正文',
    text: '根据这一页的正文和讲稿配一张图，图讲结构；正文只留图上没有的结论和易错点。',
  },
  {
    name: '/正文',
    hint: '把内容整理成一页大纲（两级列表，10 行内）',
    text: '把这一页的内容整理成一页 PPT 大纲：简洁、逻辑清晰、列表形式，包含一二级列表，总行数不超过 10 行。',
  },
  {
    name: '/代码',
    hint: '整理代码页，标出要讲的行',
    text: '把这一页整理成代码页：代码不超过 15 行，用行号标出这节要讲的几行，右边留一句话说明。',
  },
  {
    name: '/精简',
    hint: '删掉与图重复的文字',
    text: '这一页的图和文字有重复，删掉正文里图已经讲清楚的条目，只留图上没有的。',
  },
  {
    name: '/讲稿',
    hint: '按幻灯片内容补讲稿（note:）',
    text: '按这一页的内容补写 note: 讲稿，口语化、能照着讲，正文和图都不要动。',
  },
];

/**
 * 输入框内容 → 待选命令；不是以 / 开头就没有候选。
 * 命令名命中的排前面，说明文字命中的排后面 —— 打「图」时想要的是 /图，
 * 但 /精简 的说明里也有「图」，值得留着当第二候选。
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
