import { describe, it, expect } from 'vitest';
import { CHAT_COMMANDS, matchCommands } from '../../src/views/chatCommands';

describe('CHAT_COMMANDS', () => {
  /* 命令名跟课程 CSS 的 class 同名，省得记两套叫法 */
  it('names itself after the block it fills', () => {
    expect(CHAT_COMMANDS.map((c) => c.name)).toEqual(['/fig', '/abstract']);
  });

  /* 两条都从讲稿出发，而且都不许动讲稿 */
  it('works from the speaker notes and leaves them alone', () => {
    for (const command of CHAT_COMMANDS) {
      expect(command.text, command.name).toContain('note: 讲稿');
      expect(command.text, command.name).toContain('一个字都不要动');
    }
  });

  it('puts each block in its own grid class', () => {
    expect(CHAT_COMMANDS[0].text).toContain('class="fig"');
    expect(CHAT_COMMANDS[1].text).toContain('class="abstract"');
  });
});

describe('matchCommands', () => {
  it('offers nothing until you type a slash', () => {
    expect(matchCommands('给这页配图')).toEqual([]);
    expect(matchCommands('')).toEqual([]);
  });

  it('offers everything on a bare slash', () => {
    expect(matchCommands('/')).toHaveLength(CHAT_COMMANDS.length);
  });

  it('matches on the name', () => {
    expect(matchCommands('/fi').map((c) => c.name)).toEqual(['/fig']);
    expect(matchCommands('/abs').map((c) => c.name)).toEqual(['/abstract']);
  });

  /* 名字是英文，但中文也该找得到 —— 走的是说明那一路 */
  it('still finds a command by its Chinese description', () => {
    expect(matchCommands('/图').map((c) => c.name)).toEqual(['/fig']);
    expect(matchCommands('/大纲').map((c) => c.name)).toEqual(['/abstract']);
  });

  it('comes back empty for a typo rather than guessing', () => {
    expect(matchCommands('/zzz')).toEqual([]);
  });
});
