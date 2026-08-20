import type { AiProfile } from '../ai/profiles';

export interface PluginSettings {
  // 画布
  size: string;                    // "16:9" | "4:3" | "21:9" | "1920x1080"
  width: number | null;
  height: number | null;
  margin: number;                  // 0 ~ 1
  autoFontScale: boolean;
  fontScale: number;               // 整体字号倍率（仅设置页，不进 frontmatter）

  // 分页
  separator: string;               // 水平分页正则，默认: '\\r?\\n---\\r?\\n'
  verticalSeparator: string;       // 垂直分页正则，默认: '\\r?\\nxxx\\r?\\n'
  headingDivider: number[] | null; // 自动分页的标题级别
  notesSeparator: string;          // 演讲备注起始标记，默认: 'note:'

  // 动画
  transition: 'none' | 'fade' | 'slide' | 'convex' | 'concave' | 'zoom';
  transitionSpeed: 'default' | 'fast' | 'slow';

  // 控件
  controls: boolean;
  progress: boolean;
  slideNumber: boolean | 'c/t';
  center: boolean;

  // 文档级
  title: string | null;            // 导出 HTML 标题
  css: string[];                   // 追加本地 CSS 文件路径
  remoteCSS: string[];             // 追加远程 CSS URL
  bg: string | null;               // 全局默认背景（可被单页 data-background-* 覆盖）

  // 增强功能
  enableOverview: boolean;         // 总览模式（Esc 缩略图，reveal.js 核心功能）

  // 预览服务器
  autoStartServer: boolean;
  port: number;                    // 默认 3000

  // 导出
  exportDirectory: string;
  /**
   * PPTX 导出时，为无法转成 PowerPoint 原生对象的块（mermaid / Chart.js / 视频）
   * 留一个灰色说明框。关掉则这些块在 pptx 里直接消失。
   */
  pptxPlaceholders: boolean;

  // 预览
  /**
   * 预览面板位置：
   *   'tab'     主编辑区右侧分栏，与笔记并排（默认，同 advanced-slides）
   *   'window'  独立弹出窗口（可拖到副屏）
   *   'sidebar' 右侧边栏
   */
  previewMode: 'tab' | 'window' | 'sidebar';
  scrollActivationWidth: number | null; // reveal.js 自动滚动视图阈值，null=禁用
  autoReload: boolean;
  autoComplete: boolean;
  /** 打开笔记时自动折叠 ```svg 块（SVG 动画几十行，摊开会把正文挤没） */
  autoFoldSvg: boolean;
  /** 预览里画出每个 <grid> 的边框与画布 10% 标尺，方便调版面 */
  showGridGuides: boolean;
  /** 编辑器光标移动时，预览自动跳到光标所在页 */
  syncCursor: boolean;
  /** 反向：预览翻页时，编辑器光标自动移到该页在源码里的起始行 */
  syncSlide: boolean;

  // AI 助手（预览面板下方的对话框，只改当前这一页）
  aiEnabled: boolean;
  /**
   * 存下来的几套接口（地址 + key + 模型）。一个不够用：便宜快的那个改文字挺好，
   * 画图就明显不行；中转站上的 GPT / Claude 画得动，但每次改三个字段太烦。
   */
  aiProfiles: AiProfile[];
  /** 现在用哪一套（AiProfile.id）；对不上就退回第一套 */
  aiActiveProfile: string;

  /** @deprecated 分档案之前的三个字段，只用来把老设置迁进 aiProfiles */
  aiApiBase: string;
  /** @deprecated 见 aiApiBase */
  aiApiKey: string;
  /** @deprecated 见 aiApiBase */
  aiModel: string;
  /** 等模型多久就不等了（秒）。画一张图要吐两三千 token，慢模型三分钟写不完 */
  aiTimeoutSeconds: number;
  /**
   * AI 提示词文件（库内路径）。存在就用它，不存在就用插件内置的那份。
   * 跟课程 CSS 一个思路：这套规矩是你的教学习惯，该由你改，不该藏在代码里。
   */
  aiPromptPath: string;
  /**
   * 配图描述提示词文件（库内路径）。规矩同上：存在就用它，不存在用内置那份。
   * 跟对话框那份分开放 —— 一份管怎么改这一页的字，一份管怎么想这张图，
   * 混在一个文件里改哪句都得先找半天。
   */
  aiFigurePromptPath: string;
  /** 对话框占预览面板的比例（0~1），默认四六开 */
  aiPanelRatio: number;
  /** 配图用哪一套画风（ImageStyle.id） */
  aiFigureStyle: string;
  /**
   * 切换笔记时预览是否跟着换。
   * 默认关：预览钉在你让它预览的那一篇上，翻别的笔记查资料不会把它带跑；
   * 想换对象就在新笔记上执行一次 Show Slide Preview。
   */
  followActiveNote: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  size: '16:9',
  width: null,
  height: null,
  margin: 0.04,
  autoFontScale: true,
  fontScale: 1,
  separator: '\r?\n---\r?\n',
  verticalSeparator: '\r?\nxxx\r?\n',
  headingDivider: null,
  notesSeparator: 'note:',
  transition: 'slide',
  transitionSpeed: 'default',
  controls: true,
  progress: true,
  slideNumber: true,
  center: true,
  title: null,
  css: [],
  remoteCSS: [],
  bg: null,
  enableOverview: true,
  autoStartServer: true,
  port: 3000,
  exportDirectory: '/export',
  pptxPlaceholders: true,
  previewMode: 'tab',
  scrollActivationWidth: null,
  autoReload: true,
  autoComplete: true,
  autoFoldSvg: true,
  showGridGuides: false,
  syncCursor: true,
  syncSlide: true,
  followActiveNote: false,

  aiEnabled: true,
  aiProfiles: [],
  aiActiveProfile: '',
  aiApiBase: 'https://api.deepseek.com/v1',
  aiApiKey: '',
  aiModel: 'deepseek-v4-flash',
  aiTimeoutSeconds: 300,
  aiPromptPath: 'Extra/RevealSlides/提示词.md',
  aiFigurePromptPath: 'Extra/RevealSlides/配图提示词.md',
  aiPanelRatio: 0.4,
  aiFigureStyle: 'lecture',
};
