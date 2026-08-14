import { describe, it, expect } from 'vitest';
import {
  isInsideDir,
  sidecarCssCandidates,
  themeCssCandidates,
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

describe('themeCssCandidates', () => {
  it('walks up from the note folder, nearest first', () => {
    const paths = themeCssCandidates('学期/单片机/理论课/第1章.md');
    // 每一级都给出四个候选：themes/ 与 theme/ 各自的 .css 与 .md
    expect(paths.slice(0, 4)).toEqual([
      '学期/单片机/理论课/themes/course.css',
      '学期/单片机/理论课/themes/course.md',
      '学期/单片机/理论课/theme/course.css',
      '学期/单片机/理论课/theme/course.md',
    ]);
    expect(paths.slice(-4)).toEqual([
      'themes/course.css',
      'themes/course.md',
      'theme/course.css',
      'theme/course.md',
    ]);
    // 目录层数 + 库根，每层四个
    expect(paths).toHaveLength(4 * 4);
  });

  it('accepts a markdown theme so it can be edited like a normal note', () => {
    expect(themeCssCandidates('理论课/第1章.md')).toContain('理论课/theme/course.md');
  });

  it('falls back to the vault root for a note at the root', () => {
    expect(themeCssCandidates('第1章.md')).toEqual([
      'themes/course.css',
      'themes/course.md',
      'theme/course.css',
      'theme/course.md',
    ]);
  });
});
