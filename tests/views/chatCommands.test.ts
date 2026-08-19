import { describe, it, expect } from 'vitest';
import { CHAT_COMMANDS, matchCommands } from '../../src/views/chatCommands';

describe('matchCommands', () => {
  it('offers nothing until you type a slash', () => {
    expect(matchCommands('给这页配图')).toEqual([]);
    expect(matchCommands('')).toEqual([]);
  });

  it('offers everything on a bare slash', () => {
    expect(matchCommands('/')).toHaveLength(CHAT_COMMANDS.length);
  });

  /* 名字命中的排第一；说明里也提到「图」的排后面，仍是有用的第二候选 */
  it('ranks a name match ahead of a description match', () => {
    expect(matchCommands('/图').map((c) => c.name)).toEqual(['/图', '/精简']);
  });

  it('also filters by what the command does', () => {
    expect(matchCommands('/大纲').map((c) => c.name)).toEqual(['/正文']);
  });

  it('comes back empty for a typo rather than guessing', () => {
    expect(matchCommands('/zzz')).toEqual([]);
  });
});
