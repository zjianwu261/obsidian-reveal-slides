import { describe, it, expect } from 'vitest';
import { collectVaultAssetRefs, localizeAssetPaths } from '../../src/export/assetLocalizer';

const SERVER = 'http://127.0.0.1:3000';

describe('collectVaultAssetRefs', () => {
  it('collects vault asset URLs and decodes the absolute path', () => {
    const html = `<img src="${SERVER}/vault/Users/me/vault/pic%20a.png">`;
    const refs = collectVaultAssetRefs(html, SERVER);
    expect(refs).toEqual([
      { url: `${SERVER}/vault/Users/me/vault/pic%20a.png`, absolutePath: '/Users/me/vault/pic a.png' },
    ]);
  });

  it('dedupes repeated URLs', () => {
    const url = `${SERVER}/vault/a/b.png`;
    const refs = collectVaultAssetRefs(`<img src="${url}"><img src="${url}">`, SERVER);
    expect(refs).toHaveLength(1);
  });

  it('ignores remote http(s) images', () => {
    const html = '<img src="https://example.com/x.png"><img src="http://foo.bar/y.png">';
    expect(collectVaultAssetRefs(html, SERVER)).toHaveLength(0);
  });

  it('stops the path at quotes, whitespace and closing paren', () => {
    const html = `<div style="background-image: url(${SERVER}/vault/a/b.png)"></div>`;
    const refs = collectVaultAssetRefs(html, SERVER);
    expect(refs[0].absolutePath).toBe('/a/b.png');
  });

  // 内联通道（移动端、服务器没起来时）资源保持 app:// 原样，导出同样要认
  it('collects app:// references and drops the ?mtime cache buster', () => {
    const refs = collectVaultAssetRefs('<img src="app://abc123/Users/me/v/pic%20a.png?1699">');
    expect(refs).toEqual([
      { url: 'app://abc123/Users/me/v/pic%20a.png?1699', absolutePath: '/Users/me/v/pic a.png' },
    ]);
  });

  it('collects both URL forms in one deck', () => {
    const html = `<img src="${SERVER}/vault/a/b.png"><img src="app://id/c/d.png">`;
    expect(collectVaultAssetRefs(html, SERVER).map((r) => r.absolutePath)).toEqual([
      '/a/b.png',
      '/c/d.png',
    ]);
  });

  it('dedupes app:// URLs and ignores remote images without a serverBase', () => {
    const html = '<img src="app://id/a.png"><img src="app://id/a.png"><img src="https://x.com/y.png">';
    expect(collectVaultAssetRefs(html)).toHaveLength(1);
  });
});

describe('localizeAssetPaths', () => {
  it('rewrites mapped URLs to relative paths', () => {
    const url = `${SERVER}/vault/a/b.png`;
    const html = `<img src="${url}">`;
    expect(localizeAssetPaths(html, { [url]: 'files/b.png' })).toBe('<img src="files/b.png">');
  });

  it('rewrites every occurrence of the same URL', () => {
    const url = `${SERVER}/vault/a/b.png`;
    const html = `<img src="${url}"><img src="${url}">`;
    const out = localizeAssetPaths(html, { [url]: 'files/b.png' });
    expect(out.match(/files\/b\.png/g)).toHaveLength(2);
  });

  it('leaves unmapped and remote references untouched', () => {
    const html = `<img src="${SERVER}/vault/a/missing.png"><img src="https://example.com/x.png">`;
    expect(localizeAssetPaths(html, {})).toBe(html);
  });
});
