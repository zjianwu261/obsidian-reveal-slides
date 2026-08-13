/**
 * 预览服务器冒烟测试（模拟 Obsidian 环境，无需启动 Obsidian）。
 * 用法: npm run build && node scripts/smoke-server.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── obsidian 桩模块（仅实现服务器链路用到的部分）────────────
class FileSystemAdapter {
  getBasePath() {
    return root;
  }
}
const obsidianStub = {
  FileSystemAdapter,
  Notice: class {
    constructor(msg) {
      console.log('[Notice]', msg);
    }
  },
  Plugin: class {},
  ItemView: class {
    constructor(leaf) {
      this.leaf = leaf;
    }
  },
  PluginSettingTab: class {},
  Setting: class {},
  MarkdownRenderer: class {},
  Component: class {},
  TFile: class {},
};

const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'obsidian') return 'obsidian-stub';
  return originalResolve.call(this, request, ...args);
};
require.cache['obsidian-stub'] = {
  id: 'obsidian-stub',
  filename: 'obsidian-stub',
  loaded: true,
  exports: obsidianStub,
};

const RevealPlugin = require(path.join(root, 'dist', 'main.js')).default;

const plugin = new RevealPlugin();
plugin.app = {
  vault: { adapter: new FileSystemAdapter() },
  workspace: { getLeavesOfType: () => [] },
};
plugin.manifest = { dir: 'dist' };
plugin.settings = { port: 8347 };

await plugin.startServer();
console.log('server started at', plugin.server.url);

const checks = [
  ['/reveal.html', (body) => body.includes('reveal.bundle.mjs') && body.includes('reveal.css')],
  ['/deck', (body) => JSON.parse(body).pages?.length >= 1],
  ['/assets/reveal.css', (body) => body.includes('.reveal')],
  ['/assets/reset.css', (body) => body.length > 100],
  ['/assets/reveal.bundle.mjs', (body) => body.length > 100000],
  ['/assets/reveal-plugin.css', (body) => body.includes('.grid')],
  ['/assets/../main.js', null], // 期望 403/404
];

let failed = 0;
for (const [route, validate] of checks) {
  const res = await fetch(`http://127.0.0.1:8347${route}`);
  const body = await res.text();
  const ok = validate ? res.status === 200 && validate(body) : res.status === 403 || res.status === 404;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${route} → ${res.status} (${body.length} bytes)`);
  if (!ok) failed++;
}

// SSE 推送测试
const ac = new AbortController();
const ssePromise = fetch('http://127.0.0.1:8347/events', { signal: ac.signal }).then(async (res) => {
  const reader = res.body.getReader();
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
});
await new Promise((r) => setTimeout(r, 200));
plugin.server.broadcast();
const sseData = await ssePromise;
const sseOk = sseData.includes('update') || sseData.includes('retry');
console.log(`${sseOk ? 'PASS' : 'FAIL'} /events SSE → ${JSON.stringify(sseData.slice(0, 40))}`);
if (!sseOk) failed++;
ac.abort();

await plugin.stopServer();
console.log(failed === 0 ? 'SMOKE TEST PASSED' : `SMOKE TEST FAILED (${failed})`);
process.exit(failed === 0 ? 0 : 1);
