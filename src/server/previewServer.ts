import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { FileSystemAdapter, Notice } from 'obsidian';
import type RevealPlugin from '../main';
import type { SlideDeck } from '../types/slide';
import { renderPage } from '../engine/templateEngine';
import { isInsideDir, urlPathToNative } from '../utils/vaultPath';
import revealTemplate from '../template/reveal.html';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** 端口被占用时最多顺延几次 */
const MAX_PORT_ATTEMPTS = 10;

/**
 * 本地预览服务器：仅监听 127.0.0.1，为 iframe 提供 reveal.js 资源与渲染结果。
 * 路由:
 *   GET /reveal.html  → 渲染页面模板
 *   GET /assets/*     → dist/assets/ 静态资源
 *   GET /vault/*      → vault 根目录下的文件（iframe 内图片/视频加载用）
 *   GET /deck         → 当前 SlideDeck JSON
 *   GET /events       → SSE，deck 更新时推送
 */
export class PreviewServer {
  private server: http.Server | null = null;
  private sseClients = new Set<http.ServerResponse>();
  private deck: SlideDeck;
  private port = 0;

  constructor(private plugin: RevealPlugin) {
    this.deck = plugin.deck;
  }

  get running(): boolean {
    return this.server !== null;
  }

  /** 实际监听的端口（端口被占用时会顺延，未必等于设置里的值） */
  get boundPort(): number {
    return this.port;
  }

  /** 服务器根地址，供管线改写 vault 资源 URL */
  get base(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get url(): string {
    return `${this.base}/reveal.html`;
  }

  private get assetsDir(): string {
    const pluginDir = this.plugin.manifest.dir ?? '';
    return path.join(this.vaultBasePath, pluginDir, 'assets');
  }

  /** vault 根目录（仅文件系统库可用） */
  private get vaultBasePath(): string {
    const adapter = this.plugin.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error('reveal-for-obsidian requires a filesystem vault');
    }
    return adapter.getBasePath();
  }

  /**
   * 启动服务器。端口被占用时顺延到下一个端口重试
   * （3000 这类常用端口经常被别的插件或开发服务器占着，直接失败等于预览完全不可用）。
   */
  async start(port: number): Promise<void> {
    if (this.server) return;

    await this.listen(port, MAX_PORT_ATTEMPTS);

    if (this.port !== port) {
      new Notice(
        `reveal-for-obsidian: port ${port} is in use, preview server started on ${this.port}`,
      );
    }
  }

  private listen(port: number, attemptsLeft: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handleRequest(req, res));

      server.on('error', (err: NodeJS.ErrnoException) => {
        this.server = null;
        if (err.code === 'EADDRINUSE' && attemptsLeft > 1) {
          resolve(this.listen(port + 1, attemptsLeft - 1));
          return;
        }
        if (err.code === 'EADDRINUSE') {
          new Notice(`reveal-for-obsidian: ports ${port - MAX_PORT_ATTEMPTS + 1}-${port} are all in use`);
        } else {
          new Notice(`reveal-for-obsidian: server error: ${err.message}`);
        }
        reject(err);
      });

      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        this.port = port;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();

    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  setDeck(deck: SlideDeck): void {
    this.deck = deck;
    this.broadcast();
  }

  /** 通知所有 iframe 客户端 deck 已更新 */
  broadcast(): void {
    this.send({ type: 'update' });
  }

  /** 让预览跳到指定页（光标跟随），不重新拉取 deck */
  gotoPage(pageIndex: number): void {
    this.send({ type: 'goto', page: pageIndex });
  }

  private send(message: Record<string, unknown>): void {
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    for (const client of this.sseClients) {
      client.write(payload);
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname;

    try {
      if (pathname === '/' || pathname === '/reveal.html') {
        this.serveHtml(res);
      } else if (pathname === '/deck') {
        this.serveDeck(res);
      } else if (pathname === '/events') {
        this.serveEvents(req, res);
      } else if (pathname.startsWith('/assets/')) {
        this.serveAsset(pathname, res);
      } else if (pathname.startsWith('/vault/')) {
        this.serveVaultFile(pathname, res);
      } else {
        res.writeHead(404).end('Not Found');
      }
    } catch (err) {
      res.writeHead(500).end(`Internal Server Error: ${String(err)}`);
    }
  }

  private serveHtml(res: http.ServerResponse): void {
    const html = renderPage(revealTemplate, this.deck);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  }

  private serveDeck(res: http.ServerResponse): void {
    res
      .writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      .end(JSON.stringify(this.deck));
  }

  private serveEvents(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`retry: 2000\n\n`);
    this.sseClients.add(res);
    req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  private serveAsset(pathname: string, res: http.ServerResponse): void {
    const relative = decodeURIComponent(pathname.slice('/assets/'.length));
    // 防目录穿越
    if (relative.includes('..') || path.isAbsolute(relative)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const filePath = path.join(this.assetsDir, relative);
    if (!filePath.startsWith(this.assetsDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404).end('Not Found');
      return;
    }

    const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  }

  /** GET /vault/* → 从 vault 根目录流式返回文件（iframe 内 app:// 资源改写后的加载入口） */
  private serveVaultFile(pathname: string, res: http.ServerResponse): void {
    // /vault/<url 形式的绝对路径>：转成本地路径（Windows 上要脱掉盘符前的斜杠、
    // 换成反斜杠），且必须仍位于 vault 根目录内（防路径穿越）
    const decoded = decodeURIComponent(pathname.slice('/vault/'.length));
    const filePath = urlPathToNative(decoded.startsWith('/') ? decoded : `/${decoded}`);
    if (!isInsideDir(this.vaultBasePath, filePath)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404).end('Not Found');
      return;
    }

    const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  }
}
