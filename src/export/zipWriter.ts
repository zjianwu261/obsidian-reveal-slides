/**
 * 最小 ZIP 写入器 —— .pptx 就是一个 OPC（zip）包。
 *
 * 不引第三方 zip 库：包结构只有「本地头 + 数据」「中央目录」「EOCD」三段，
 * 手写不过百行，而任何 zip 依赖都会再往 main.js 里塞几十 KB。
 * 依赖 Node 的 zlib 与 Buffer，故本模块只能在桌面端求值（由 pptxExporter 动态 import 进来）。
 */
import { deflateRawSync } from 'zlib';

export interface ZipEntry {
  /** zip 内路径，一律用 '/' 分隔且不以 '/' 开头 */
  path: string;
  data: Buffer | string;
  /** true = 直接存储不压缩（png/jpg 本身已压缩，再 deflate 只是白费 CPU） */
  store?: boolean;
}

/** CRC-32 查表（IEEE 802.3 多项式，zip 规范指定） */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** JS Date → MS-DOS 的 (time, date) 双字段（zip 头里的时间戳格式） */
function dosDateTime(date: Date): { time: number; date: number } {
  // DOS 纪元从 1980 起；早于此的时间钳到 1980-01-01，避免写出负数年份
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time:
      (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * 打包为 zip。条目按传入顺序写入 —— OPC 规范建议 `[Content_Types].xml` 排在最前，
 * 调用方保证这一点即可（PowerPoint 对此并不严格，但有些解包工具在意）。
 */
export function createZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  const stamp = dosDateTime(new Date());
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const raw = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data;

    // 已压缩的数据 deflate 后可能反而变大，那就退回 store
    const deflated = entry.store ? null : deflateRawSync(raw, { level: 9 });
    const compressed = deflated !== null && deflated.length < raw.length;
    const body = compressed ? deflated! : raw;
    const method = compressed ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
    local.writeUInt16LE(20, 4); // 解压所需版本 2.0
    local.writeUInt16LE(0x0800, 6); // 通用标志位：文件名为 UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // 无扩展字段
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // 中央目录项签名
    central.writeUInt16LE(20, 4); // 生成方版本
    central.writeUInt16LE(20, 6); // 解压所需版本
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); // 对应本地头的偏移
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralSize = centrals.reduce((sum, buf) => sum + buf.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD 签名
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, ...centrals, eocd]);
}
