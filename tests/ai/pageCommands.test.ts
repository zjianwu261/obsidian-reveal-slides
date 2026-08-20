import { describe, it, expect } from 'vitest';
import { PAGE_COMMANDS } from '../../src/ai/pageCommands';

describe('PAGE_COMMANDS', () => {
  it('gives every command a unique id', () => {
    const ids = PAGE_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /* 两条都从讲稿出发，而且都不许动讲稿 */
  it('works from the speaker notes and leaves them alone', () => {
    for (const command of PAGE_COMMANDS) {
      expect(command.text, command.name).toContain('note: 讲稿');
      expect(command.text, command.name).toContain('一个字都不要动');
    }
  });

  it('puts each block in its own grid class', () => {
    expect(PAGE_COMMANDS[0].text).toContain('class="fig"');
    expect(PAGE_COMMANDS[1].text).toContain('class="abstract"');
  });
});
