/**
 * 代码块的渲染后处理（客户端，运行在预览 iframe 内）：重新高亮 + 长代码自适应。
 *
 * 长代码自适应：渲染完成后对 .grid 内的 <pre> 测量溢出：
 *   1. 按溢出比例直接算出目标 font-size（line-height 按原比例跟随），至多迭代几轮收敛
 *   2. 到下限（10px）仍溢出则用 transform: scale() 兜底（transform-origin: top left）
 * 不溢出的保持原样（grid 默认 flex 居中由 CSS 处理）。
 *
 * 注意：此文件运行在浏览器环境，不得 import 'obsidian'。
 */

/** 字号下限（px） */
const MIN_FONT_SIZE = 10;
/**
 * 收敛轮数上限。
 * 代码块的高宽基本与字号成正比（padding 用的是 em，跟着一起缩），所以「按溢出比例
 * 一次算到位」通常一轮就够，两三轮足以收敛；留 5 轮是给 padding/边框那点非线性余量。
 */
const MAX_PASSES = 5;
/** 每轮多收一点点，避免亚像素误差导致差一点点放不下、白白多跑一轮 */
const SAFETY = 0.995;

function fits(pre: HTMLElement, container: HTMLElement): boolean {
  return pre.scrollHeight <= container.clientHeight && pre.scrollWidth <= container.clientWidth;
}

function fitCodeBlock(pre: HTMLElement, container: HTMLElement): void {
  /*
   * 容器还没有尺寸就别量：量到的 0 会让下面每一轮都判定「放不下」，一路缩到 10px 下限。
   * ?print-pdf 打印视图排版期间、以及还没进入视距的垂直子页（display: none）都会出现。
   */
  if (container.clientHeight <= 0 || container.clientWidth <= 0) return;
  if (fits(pre, container)) return;

  const computed = getComputedStyle(pre);
  let fontSize = parseFloat(computed.fontSize) || 16;
  const baseLineHeight = parseFloat(computed.lineHeight) || fontSize * 1.4;
  /*
   * 行距按比例跟着字号走，别跟字号一起「各减 0.5px」—— 那样越缩行距比例越大
   * （22px/1.4 缩到 16px 时行距还是 24.8px，等于 1.55 倍），行间白比字还占地方，
   * 于是为了塞下又得多缩几档，字反而更小。
   */
  const ratio = baseLineHeight / (fontSize || 1);

  /*
   * 按溢出比例直接算目标字号，而不是 0.5px 一档地试。
   *
   * 每改一次 font-size 再读 scrollHeight 就是一次强制重排，而每一次读写都卡在主线程上。
   * 从 36px 试到 10px 是 52 轮 —— 一章几十个代码块就是几千次重排，预览时能感觉到卡，
   * 导出 PDF 时整份 deck 的所有页同时在布局树里，这几千次重排要重算的东西更是成倍地多，
   * 「导出很慢」有相当一部分就出在这里。按比例算的话两三轮就到位。
   */
  for (let pass = 0; pass < MAX_PASSES && fontSize > MIN_FONT_SIZE; pass += 1) {
    const scale = Math.min(
      container.clientHeight / (pre.scrollHeight || 1),
      container.clientWidth / (pre.scrollWidth || 1),
    );
    if (scale >= 1) break;
    const next = Math.max(MIN_FONT_SIZE, fontSize * scale * SAFETY);
    // 收不动了（已经到下限，或比例算出来反而更大）：交给下面的 transform 兜底
    if (next >= fontSize) break;
    fontSize = next;
    pre.style.fontSize = `${fontSize.toFixed(2)}px`;
    pre.style.lineHeight = `${(fontSize * ratio).toFixed(2)}px`;
    if (fits(pre, container)) break;
  }

  // 到下限仍溢出：transform 缩放兜底
  if (!fits(pre, container)) {
    const scale = Math.min(
      container.clientHeight / (pre.scrollHeight || 1),
      container.clientWidth / (pre.scrollWidth || 1),
    );
    if (scale > 0 && scale < 1) {
      pre.style.transform = `scale(${scale})`;
      pre.style.transformOrigin = 'top left';
    }
  }
}

/**
 * 重新高亮 root 下尚未高亮的代码块。
 *
 * reveal 的 highlight 插件只在 Reveal.initialize() 时扫一遍 pre code，之后不再过问；
 * 而本插件每次刷新预览都把 .slides 的 innerHTML 整体重建。于是首屏代码是彩色的，
 * 源文件一改（哪怕只动一个字）重渲染，整屏代码就退回灰白 —— 编辑时看到的几乎全是灰的。
 * 这里在每次重渲染后补上那一遍。
 *
 * @param highlightBlock reveal highlight 插件的 highlightBlock（注入进来，便于测试）
 */
export function highlightCodeBlocks(
  root: ParentNode,
  highlightBlock: (block: HTMLElement) => void,
): void {
  root.querySelectorAll<HTMLElement>('pre > code').forEach((code) => {
    // hljs 高亮完会给元素挂上 .hljs。首屏这些块插件已经染过，再染一遍等于把上一轮
    // 的 <span class="hljs-..."> 当源码重新分词，颜色全乱
    if (code.classList.contains('hljs')) return;
    // 插件 init 里给每个 pre 加的类，这里一并补上，首屏与之后的 DOM 保持一致
    code.parentElement?.classList.add('code-wrapper');
    highlightBlock(code);
  });
}

/** 对 root 下每个 .grid 内的 <pre> 做自适应缩放 */
export function fitCodeBlocks(root: ParentNode): void {
  root.querySelectorAll('.grid').forEach((grid) => {
    const container = grid as HTMLElement;
    container.querySelectorAll('pre').forEach((pre) => {
      fitCodeBlock(pre as HTMLElement, container);
    });
  });
}
