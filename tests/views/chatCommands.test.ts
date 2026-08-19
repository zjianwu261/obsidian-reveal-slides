import { describe, it, expect } from 'vitest';
import { CHAT_COMMANDS, expandRequest, matchCommands } from '../../src/views/chatCommands';

describe('CHAT_COMMANDS', () => {
  /* 一页课件的三样东西：画出来的图、画出来的示意图、一段文字 */
  it('offers one command per thing a page is made of', () => {
    expect(CHAT_COMMANDS.map((c) => c.name)).toEqual(['/fig', '/svg', '/abstract']);
  });

  /* 位图走画图接口，另外两条是改这一页的源码 */
  it('sends only the bitmap one down the image path', () => {
    expect(CHAT_COMMANDS.map((c) => c.mode)).toEqual(['image', 'page', 'page']);
  });

  it('works from the speaker notes', () => {
    for (const command of CHAT_COMMANDS) {
      expect(command.text, command.name).toContain('note: 讲稿');
    }
  });

  /* 改源码那两条得说清楚往哪个格子里放，而且不许动讲稿 */
  it('names the grid it fills and leaves the notes alone', () => {
    const page = CHAT_COMMANDS.filter((c) => c.mode === 'page');
    expect(page[0].text).toContain('class="fig"');
    expect(page[1].text).toContain('class="abstract"');
    for (const command of page) expect(command.text).toContain('一个字都不要动');
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
    expect(matchCommands('/sv').map((c) => c.name)).toEqual(['/svg']);
    expect(matchCommands('/abs').map((c) => c.name)).toEqual(['/abstract']);
  });

  /* 名字是英文，但中文也该找得到 —— 走的是说明那一路 */
  it('still finds a command by its Chinese description', () => {
    expect(matchCommands('/大纲').map((c) => c.name)).toEqual(['/abstract']);
    expect(matchCommands('/矢量').map((c) => c.name)).toEqual(['/svg']);
  });

  it('comes back empty for a typo rather than guessing', () => {
    expect(matchCommands('/zzz')).toEqual([]);
  });
});

describe('expandRequest', () => {
  /* 输入框里只留 /svg，整段规矩发出去时才展开 */
  it('expands a bare command into the whole instruction', () => {
    const result = expandRequest('/svg');
    expect(result.mode).toBe('page');
    expect(result.text).toContain('class="fig"');
    expect(result.command?.name).toBe('/svg');
  });

  /* 规矩照旧，你接着写的话是补充 */
  it('keeps what you typed after the command', () => {
    const result = expandRequest('/svg 把比喻换成传送带');
    expect(result.text).toContain('class="fig"');
    expect(result.text).toContain('把比喻换成传送带');
  });

  it('takes the image path for the bitmap command', () => {
    expect(expandRequest('/fig').mode).toBe('image');
  });

  /* 没打命令就是普通一句话，原样发出去 */
  it('leaves a plain sentence alone', () => {
    const result = expandRequest('  把右边的要点改成对比图  ');
    expect(result).toEqual({ mode: 'page', text: '把右边的要点改成对比图', command: null });
  });

  /* /svgx 不是 /svg：前缀撞上了不能算命中 */
  it('does not treat a longer word as the command', () => {
    expect(expandRequest('/svgx 随便写写').command).toBeNull();
  });
});
