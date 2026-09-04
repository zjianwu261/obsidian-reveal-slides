/**
 * ?print-pdf 打印视图的判定。
 *
 * 打印视图是「导出这一刻」的定格快照，不接受热更新 —— 这不是省事，是必须：
 * reveal 的打印排版是加在 DOM 上的（每页包进一个 .pdf-page，section 再绝对定位在里面），
 * 而重渲染会整体重写 .slides 的 innerHTML，把这些包装层全冲掉。
 * 包装层没了、<html> 上的 print-pdf 类还在，
 * `html.reveal-print .reveal .slides section{position:absolute!important}` 于是继续生效，
 * 二十几页 section 一起叠在同一个坐标上 —— 打印预览里就是好几页内容糊成一页。
 *
 * 实测一次更新即可复现：.pdf-page 从 4 个变 0 个，四页 section 的 top 全变成 0，
 * .slides 高度从 4356px 塌到 0。
 *
 * 判定条件要和 reveal 自己认的保持一致（它同样是在 location.search 里找这个词），
 * 否则两边对「现在是不是打印视图」的看法会分叉：reveal 排了打印版，我们却当普通预览继续刷新。
 */

/** URL 的查询串是否要求打印视图（传 location.search，带不带前导 ? 都行） */
export function isPrintViewSearch(search: string): boolean {
  // 不用带 g 的正则字面量：RegExp 对象带 g 时 test() 会记住 lastIndex，
  // 同一个实例连着调结果会跳变（真/假/真……）—— 这里每次都要独立判定
  return /print-pdf/i.test(search);
}
