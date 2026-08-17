import { describe, it, expect } from 'vitest';
import { imageSize, svgSize } from '../../src/export/imageMeta';

/** 最小 PNG 头：签名 + IHDR 长度/类型 + 宽高 */
function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/** SOI + APP0 段 + SOF0 帧头 */
function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.alloc(4 + 12);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(14, 2); // 段长（不含标记本身）
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(9, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(8)]);
}

describe('imageSize', () => {
  it('reads PNG dimensions from IHDR', () => {
    expect(imageSize(png(1600, 900), 'png')).toEqual({ width: 1600, height: 900 });
  });

  it('reads JPEG dimensions from the SOF0 frame header', () => {
    expect(imageSize(jpeg(640, 480), 'jpg')).toEqual({ width: 640, height: 480 });
  });

  it('skips JPEG segments that are not frame headers', () => {
    // 0xC4 是 DHT，长得像 SOFn 但不是，跳过它才能读到后面真正的 SOF0
    const dht = Buffer.alloc(6);
    dht.writeUInt16BE(0xffc4, 0);
    dht.writeUInt16BE(4, 2);
    const sof = jpeg(320, 200).subarray(2);
    const data = Buffer.concat([Buffer.from([0xff, 0xd8]), dht, sof]);
    expect(imageSize(data, 'jpeg')).toEqual({ width: 320, height: 200 });
  });

  it('reads GIF dimensions', () => {
    const buf = Buffer.alloc(12);
    buf.write('GIF89a', 0, 'ascii');
    buf.writeUInt16LE(300, 6);
    buf.writeUInt16LE(200, 8);
    expect(imageSize(buf, 'gif')).toEqual({ width: 300, height: 200 });
  });

  it('reads BMP dimensions and normalizes a negative (top-down) height', () => {
    const buf = Buffer.alloc(30);
    buf.write('BM', 0, 'ascii');
    buf.writeInt32LE(120, 18);
    buf.writeInt32LE(-80, 22);
    expect(imageSize(buf, 'bmp')).toEqual({ width: 120, height: 80 });
  });

  it('returns null for unknown formats and for garbage', () => {
    expect(imageSize(Buffer.from('nope'), 'avif')).toBeNull();
    expect(imageSize(Buffer.from('nope'), 'png')).toBeNull();
  });
});

describe('svgSize', () => {
  it('prefers explicit width/height attributes', () => {
    expect(svgSize('<svg width="400" height="250" viewBox="0 0 800 500"></svg>')).toEqual({
      width: 400,
      height: 250,
    });
  });

  it('falls back to viewBox when width/height are missing', () => {
    expect(svgSize('<svg xmlns="..." viewBox="0 0 1024 768"><rect/></svg>')).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it('handles unit suffixes and comma-separated viewBox values', () => {
    expect(svgSize('<svg width="120px" height="60px"></svg>')).toEqual({ width: 120, height: 60 });
    expect(svgSize('<svg viewBox="0,0,50,25"></svg>')).toEqual({ width: 50, height: 25 });
  });

  it('returns null without an <svg> tag', () => {
    expect(svgSize('<div>not svg</div>')).toBeNull();
  });
});
