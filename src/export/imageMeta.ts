/**
 * 图片原始尺寸探测（纯字节解析，不依赖 obsidian / fs，可单测）。
 *
 * PPTX 要求每张图预先写死显示尺寸，笔记里又常常只写 `![[a.png]]` 不带宽高，
 * 只能自己从文件头把原始宽高读出来，否则所有图片都会按一个猜的比例被拉变形。
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** 扩展名 → 尺寸解析；认不出的格式返回 null，由排版按默认比例兜底 */
export function imageSize(data: Buffer, ext: string): ImageSize | null {
  switch (ext.toLowerCase()) {
    case 'png':
      return pngSize(data);
    case 'jpg':
    case 'jpeg':
      return jpegSize(data);
    case 'gif':
      return gifSize(data);
    case 'bmp':
      return bmpSize(data);
    case 'webp':
      return webpSize(data);
    case 'svg':
      return svgSize(data.toString('utf8'));
    default:
      return null;
  }
}

function valid(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

/** PNG：8 字节签名 + IHDR 块，宽高是大端 32 位 */
function pngSize(data: Buffer): ImageSize | null {
  if (data.length < 24 || data.readUInt32BE(0) !== 0x89504e47) return null;
  return valid(data.readUInt32BE(16), data.readUInt32BE(20));
}

/** GIF：'GIF87a'/'GIF89a' 后紧跟小端 16 位宽高 */
function gifSize(data: Buffer): ImageSize | null {
  if (data.length < 10 || data.toString('ascii', 0, 3) !== 'GIF') return null;
  return valid(data.readUInt16LE(6), data.readUInt16LE(8));
}

/** BMP：DIB 头里的小端 32 位宽高（高度可能为负，表示自上而下） */
function bmpSize(data: Buffer): ImageSize | null {
  if (data.length < 26 || data.toString('ascii', 0, 2) !== 'BM') return null;
  return valid(data.readInt32LE(18), Math.abs(data.readInt32LE(22)));
}

/**
 * JPEG：逐段跳过，直到遇到 SOFn 帧头（宽高在其中）。
 * SOF4/SOF8/SOF12 是 DHT/JPG/DAC，不是帧头，要排除。
 */
function jpegSize(data: Buffer): ImageSize | null {
  if (data.length < 4 || data.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = data[offset + 1];
    // 填充字节 / 无长度字段的独立标记
    if (marker === 0xff || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = data.readUInt16BE(offset + 2);
    const isFrame =
      (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return valid(data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5));
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** WebP：RIFF 容器里三种分块（VP8X / VP8 有损 / VP8L 无损）各有各的宽高编码 */
function webpSize(data: Buffer): ImageSize | null {
  if (data.length < 30 || data.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (data.toString('ascii', 8, 12) !== 'WEBP') return null;

  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    // 24 位「宽减一 / 高减一」
    const width = data.readUIntLE(24, 3) + 1;
    const height = data.readUIntLE(27, 3) + 1;
    return valid(width, height);
  }
  if (chunk === 'VP8 ') {
    // 关键帧头：3 字节起始码 + 16 位宽 / 高（各取低 14 位）
    return valid(data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return valid((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  return null;
}

/** SVG：优先 width/height 属性，只有 viewBox 时取它的宽高 */
export function svgSize(markup: string): ImageSize | null {
  const tag = /<svg\b[^>]*>/i.exec(markup)?.[0];
  if (!tag) return null;

  const attr = (name: string): number | null => {
    const match = new RegExp(`\\b${name}\\s*=\\s*["']?\\s*([\\d.]+)`, 'i').exec(tag);
    return match ? Number(match[1]) : null;
  };

  const width = attr('width');
  const height = attr('height');
  if (width && height) return valid(width, height);

  const viewBox = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(tag);
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) return valid(parts[2], parts[3]);
  }
  return width && !height ? valid(width, width) : null;
}
