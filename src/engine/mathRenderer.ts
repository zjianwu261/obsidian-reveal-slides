/**
 * 公式排版（客户端，运行在预览 iframe 内）。
 * 插件侧 mathProcessor 把 $...$ 换成 <span class="rfo-math" data-tex="…">，这里用
 * MathJax 排成 SVG 填回去 —— 与 Mermaid / Chart.js 同一套「占位符 + 客户端渲染」。
 *
 * 为什么选 SVG 输出而不是 Obsidian 用的 CHTML：
 *   - CHTML 的字形来自一张动态增补的样式表 + 一批 woff 字体，跨不进 iframe，
 *     更跨不进「单文件 HTML 导出」；SVG 输出把字形直接画成 path，自带、离线、可导出。
 *   - 图形化的产物顺带解决导出：导出 PPTX / 图片时公式就是普通 SVG。
 * 代价是 bundle 增加约 1.8 MB（几乎全是 TeX 字体的轮廓数据，与启用多少宏包无关）。
 *
 * 宏包取 AllPackages（比只要 base 多约 200 KB）：Obsidian 里能渲染的公式，
 * 到了幻灯片上也要能渲染 —— 「笔记里好好的，一放幻灯片就报错」是最难查的那类问题。
 *
 * 注意：此文件运行在浏览器环境，不得 import 'obsidian'。
 */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { browserAdaptor } from 'mathjax-full/js/adaptors/browserAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

RegisterHTMLHandler(browserAdaptor());

/*
 * fontCache: 'local' —— 字形的 <defs> 跟着每个公式走。
 * 'global' 会把它们攒进文档里一个共享的 <svg>，而本插件每次刷新预览都重建整棵 DOM：
 * 共享节点一旦被换掉，之前引用它的公式就只剩空白。
 */
const mathDocument = mathjax.document(document, {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: 'local' }),
});

/** MathJax 自己那份 SVG 样式表只需注入一次 */
let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  const style = mathDocument.outputJax.styleSheet(mathDocument) as unknown as Node;
  if (style) {
    document.head.appendChild(style);
    stylesInjected = true;
  }
}

/**
 * 把 root 下的 .rfo-math 占位元素排版成 SVG。
 * 单条公式写错不该拖垮整页：出错就保留占位元素里的原始 $...$ 文本，另打上标记备查。
 */
export function renderMath(root: ParentNode): void {
  const nodes = root.querySelectorAll<HTMLElement>('.rfo-math[data-tex]');
  if (nodes.length === 0) return;

  injectStyles();

  nodes.forEach((node) => {
    const tex = node.getAttribute('data-tex');
    if (tex === null) return;
    try {
      const output = mathDocument.convert(tex, {
        display: node.hasAttribute('data-display'),
      }) as unknown as Node;
      node.textContent = '';
      node.appendChild(output);
    } catch (err) {
      node.setAttribute('data-math-error', String(err));
      console.error('[reveal-slide-for-obsidian] math render failed', tex, err);
    }
  });
}
