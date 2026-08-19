/**
 * 代码块行号与行高亮：把围栏语言标记旁的写法展开成 reveal 认识的属性。
 *
 *   ```c [2,4-6]       行号 + 第 2、4~6 行高亮（其余行变暗到 40%）
 *   ```c [1-2|3|4-6]   分步高亮：竖线分组，每按一次方向键换一组（reveal 的 fragment）
 *   ```c []            只加行号，不高亮任何行
 *   ```c {2,4-6}       花括号写法同义（VitePress / Shiki 那一路的习惯）
 *
 * reveal 的行号与行高亮是同一个属性 data-line-numbers，两者绑在一起：
 * 标了要高亮的行，行号就会一并显示，没法只高亮不显示行号。
 *
 * 实现上不自己往 HTML 里塞属性，而是就地展开成一条 <!-- .element: --> 指令：
 * 「属性挂到紧邻的上一个元素」这件事 elementComment 已经处理妥当（连 grid / split
 * 内部的二次渲染都覆盖到了），另起一条路径只会多出一处要同步维护的地方。
 * 于是本文件必须跑在 extractElementComments 之前 —— 那一步才把注释换成能过渲染的文本标记。
 *
 * ⚠️ 本文件不得 import 'path' 等 Node 内置模块：移动端会加载它。
 */
import { findCodeRanges, type Range } from '../utils/codeRanges';

/** 围栏首行：``` + 语言 + [行号规格] 或 {行号规格} */
const FENCE_HEAD_RE = /^(`{3,}|~{3,})([^\s`\n]*)[ \t]*(?:\[([^\]\n]*)\]|\{([^}\n]*)\})[ \t]*(\r?\n|$)/;

/**
 * 合法的行号规格：只有数字、逗号、连字符、竖线与空白。
 * 卡住这一条，是为了不去动别的插件的围栏参数 —— ```dataview {...}、```query [x]
 * 之类的写法里方括号本来就有别的含义，规格对不上就整块原样放过。
 */
const LINE_SPEC_RE = /^[\d\s,|-]*$/;

/** 范围是不是围栏代码块（findCodeRanges 还会给出行内代码的范围） */
function isFence(text: string, [start, end]: Range): boolean {
  return /^(`{3,}|~{3,})/.test(text.slice(start, end));
}

/**
 * 展开所有围栏上的行号规格。
 * 只看最外层围栏：教语法的那一页会把 ```c [2] 写进 ````markdown 块里当例子，
 * findCodeRanges 给出的范围已经把内层整个吞掉，例子天然不会被改写。
 */
export function expandCodeLineSpecs(markdown: string): string {
  if (!markdown.includes('```') && !markdown.includes('~~~')) return markdown;

  const fences = findCodeRanges(markdown).filter((range) => isFence(markdown, range));
  if (fences.length === 0) return markdown;

  let result = '';
  let last = 0;

  for (const [start, end] of fences) {
    const block = markdown.slice(start, end);
    const head = FENCE_HEAD_RE.exec(block);
    const spec = head?.[3] ?? head?.[4];
    if (!head || spec === undefined || !LINE_SPEC_RE.test(spec)) continue;

    result += markdown.slice(last, start);
    // 首行去掉规格（其余照抄），块尾补一条指令
    result += head[1] + head[2] + head[5] + block.slice(head[0].length);
    // 空行不能省：紧贴着写，指令会和代码块落进同一个 <p>，
    // elementComment 找「上一个兄弟元素」就找不到 <pre>，属性挂到段落上白挂
    result += `\n\n<!-- .element: data-line-numbers="${spec.replace(/\s+/g, '')}" -->`;
    last = end;
  }

  return result + markdown.slice(last);
}
