import { describe, it, expect } from 'vitest';
import {
  cssRefCandidates,
  promptRefCandidates,
  isInsideDir,
  sidecarCssCandidates,
  sidecarCssPath,
  nativePathToUrl,
  toVaultRelative,
  urlPathToNative,
} from '../../src/utils/vaultPath';

describe('urlPathToNative', () => {
  it('leaves posix paths alone', () => {
    expect(urlPathToNative('/Users/me/Vault/pic.png', 'posix')).toBe('/Users/me/Vault/pic.png');
  });

  it('strips the slash before a Windows drive letter', () => {
    expect(urlPathToNative('/C:/Users/me/Vault/pic.png', 'win32')).toBe(
      'C:\\Users\\me\\Vault\\pic.png',
    );
  });

  it('keeps UNC paths intact on Windows', () => {
    expect(urlPathToNative('//server/share/a.png', 'win32')).toBe('\\\\server\\share\\a.png');
  });
});

describe('isInsideDir', () => {
  it('accepts a file inside the vault', () => {
    expect(isInsideDir('/Users/me/Vault', '/Users/me/Vault/a/b.png', 'posix')).toBe(true);
  });

  it('rejects escapes', () => {
    expect(isInsideDir('/Users/me/Vault', '/Users/me/Other/b.png', 'posix')).toBe(false);
    expect(isInsideDir('/Users/me/Vault', '/etc/passwd', 'posix')).toBe(false);
  });

  it('rejects a sibling directory sharing the prefix', () => {
    // 纯字符串 startsWith 会把 Vault2 误判成在 Vault 里
    expect(isInsideDir('/Users/me/Vault', '/Users/me/Vault2/b.png', 'posix')).toBe(false);
  });

  it('matches Windows paths case-insensitively', () => {
    expect(isInsideDir('C:\\Users\\me\\Vault', 'c:\\users\\ME\\Vault\\a.png', 'win32')).toBe(true);
  });

  it('compares a Windows base against a converted url path', () => {
    const target = urlPathToNative('/C:/Users/me/Vault/a.png', 'win32');
    expect(isInsideDir('C:\\Users\\me\\Vault', target, 'win32')).toBe(true);
  });

  it('still rejects traversal on Windows', () => {
    const target = urlPathToNative('/C:/Users/me/Vault/../Secret/a.png', 'win32');
    expect(isInsideDir('C:\\Users\\me\\Vault', target, 'win32')).toBe(false);
  });
});

describe('nativePathToUrl', () => {
  it('is a no-op on posix', () => {
    expect(nativePathToUrl('/Users/me/a.png', 'posix')).toBe('/Users/me/a.png');
  });

  it('turns backslashes into a url path on Windows', () => {
    expect(nativePathToUrl('C:\\Users\\me\\a.png', 'win32')).toBe('/C:/Users/me/a.png');
  });
});

describe('toVaultRelative', () => {
  it('returns a forward-slash relative path on both platforms', () => {
    expect(toVaultRelative('/Users/me/Vault', '/Users/me/Vault/a/b.png', 'posix')).toBe('a/b.png');
    expect(toVaultRelative('C:\\Users\\me\\Vault', 'C:\\Users\\me\\Vault\\a\\b.png', 'win32')).toBe(
      'a/b.png',
    );
  });

  it('returns null for a file outside the vault', () => {
    expect(toVaultRelative('/Users/me/Vault', '/etc/passwd', 'posix')).toBeNull();
  });
});

describe('sidecarCssPath', () => {
  it('swaps the extension, keeping the folder', () => {
    expect(sidecarCssPath('课程/理论课/第1章.md')).toBe('课程/理论课/第1章.css');
  });

  it('handles a note at the vault root', () => {
    expect(sidecarCssPath('第1章.md')).toBe('第1章.css');
  });

  it('only strips the last extension', () => {
    expect(sidecarCssPath('课程/v1.2 讲义.md')).toBe('课程/v1.2 讲义.css');
  });
});

describe('sidecarCssCandidates', () => {
  it('looks beside the note, in a same-named folder, and in assets/<note>/', () => {
    expect(sidecarCssCandidates('理论课/第1章.md')).toEqual([
      '理论课/第1章.css',
      '理论课/第1章/第1章.css',
      '理论课/第1章/style.css',
      '理论课/assets/第1章/第1章.css',
      '理论课/assets/第1章/style.css',
    ]);
  });

  it('adds the attachment folder when one is known', () => {
    const paths = sidecarCssCandidates('理论课/第1章.md', '理论课/附件/第1章');
    expect(paths).toContain('理论课/附件/第1章/第1章.css');
    expect(paths).toContain('理论课/附件/第1章/style.css');
  });

  it('does not repeat a candidate when the attachment folder is already covered', () => {
    const paths = sidecarCssCandidates('理论课/第1章.md', '理论课/assets/第1章');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('works for a note at the vault root', () => {
    expect(sidecarCssCandidates('第1章.md')[0]).toBe('第1章.css');
  });
});

describe('cssRefCandidates', () => {
  const note = '理论课/第1章.md';

  it('resolves a path relative to the note first, then vault-absolute', () => {
    expect(cssRefCandidates('theme/course.md', note)).toEqual([
      '理论课/theme/course.md',
      'theme/course.md',
    ]);
  });

  it('tries .md then .css when the extension is left off', () => {
    expect(cssRefCandidates('theme/course', note)).toEqual([
      '理论课/theme/course.md',
      'theme/course.md',
      '理论课/theme/course.css',
      'theme/course.css',
    ]);
  });

  it('accepts a wikilink', () => {
    expect(cssRefCandidates('[[course]]', note)).toContain('理论课/course.md');
  });

  it('strips a leading slash from a vault-absolute path', () => {
    expect(cssRefCandidates('/themes/course.css', note)).toContain('themes/course.css');
  });

  it('ignores an empty reference', () => {
    expect(cssRefCandidates('   ', note)).toEqual([]);
  });
});

describe('promptRefCandidates', () => {
  const note = '理论课/第4章.md';

  it('tries the note folder before the vault root', () => {
    expect(promptRefCandidates('Extra/RevealSlides/提示词', note)).toEqual([
      '理论课/Extra/RevealSlides/提示词.md',
      'Extra/RevealSlides/提示词.md',
    ]);
  });

  /* 提示词一定是 .md，别去试 .css */
  it('only ever looks for markdown', () => {
    expect(promptRefCandidates('本章提示词', note).every((p) => p.endsWith('.md'))).toBe(true);
  });

  it('accepts a wikilink', () => {
    expect(promptRefCandidates('[[本章提示词]]', note)).toContain('理论课/本章提示词.md');
  });

  it('ignores an empty reference', () => {
    expect(promptRefCandidates('  ', note)).toEqual([]);
  });
});
