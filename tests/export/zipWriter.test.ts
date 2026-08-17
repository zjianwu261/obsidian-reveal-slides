import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'zlib';
import { createZip, crc32 } from '../../src/export/zipWriter';

/** 从 EOCD 往回读中央目录，解出各条目（相当于一个迷你解包器，用来验证写出来的包） */
function readZip(zip: Buffer): { path: string; data: Buffer }[] {
  const eocd = zip.length - 22;
  expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  const entries: { path: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    const method = zip.readUInt16LE(offset + 10);
    const crc = zip.readUInt32LE(offset + 16);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const localOffset = zip.readUInt32LE(offset + 42);
    const path = zip.toString('utf8', offset + 46, offset + 46 + nameLength);

    // 本地头长度可变（文件名 + 扩展字段），照着头里的长度跳过去
    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const body = zip.subarray(start, start + compressedSize);

    const data = method === 8 ? inflateRawSync(body) : body;
    expect(crc32(data)).toBe(crc);
    entries.push({ path, data });
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return entries;
}

describe('crc32', () => {
  it('matches the known CRC-32 of "123456789"', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('is 0 for empty input', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe('createZip', () => {
  it('round-trips text entries through deflate', () => {
    const text = 'hello '.repeat(200);
    const zip = createZip([{ path: 'a/b.xml', data: text }]);
    const entries = readZip(zip);

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('a/b.xml');
    expect(entries[0].data.toString('utf8')).toBe(text);
  });

  it('keeps entry order and preserves binary payloads', () => {
    const binary = Buffer.from([0, 1, 2, 253, 254, 255]);
    const zip = createZip([
      { path: '[Content_Types].xml', data: '<Types/>' },
      { path: 'ppt/media/image1.png', data: binary, store: true },
    ]);

    const entries = readZip(zip);
    expect(entries.map((e) => e.path)).toEqual(['[Content_Types].xml', 'ppt/media/image1.png']);
    expect(entries[1].data.equals(binary)).toBe(true);
  });

  it('falls back to stored when deflate would grow the payload', () => {
    // 6 字节随机数据压不动，deflate 后反而更长，此时必须走 store
    const zip = createZip([{ path: 'x', data: Buffer.from([7, 91, 3, 200, 11, 42]) }]);
    const eocd = zip.length - 22;
    const central = zip.readUInt32LE(eocd + 16);
    expect(zip.readUInt16LE(central + 10)).toBe(0); // 压缩方式 0 = store
    expect(readZip(zip)[0].data).toEqual(Buffer.from([7, 91, 3, 200, 11, 42]));
  });

  it('writes UTF-8 file names with the language-encoding flag set', () => {
    const zip = createZip([{ path: '课件/第一讲.xml', data: 'x' }]);
    expect(readZip(zip)[0].path).toBe('课件/第一讲.xml');
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
  });
});
