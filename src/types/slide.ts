import type { PluginSettings } from './config';

export interface SlideNote {
  content: string;
}

export interface SlidePage {
  index: number;
  type: 'horizontal' | 'vertical';
  html: string;                    // 渲染后的 HTML 内容
  notes: SlideNote[];
  background?: string;             // data-background-color 或 data-background-image
  attributes: Record<string, string>; // <!-- .slide: --> 解析的属性
}

export interface SlideDeck {
  title: string;
  pages: SlidePage[];
  config: Partial<PluginSettings>; // frontmatter 覆盖后的配置
  cssVariables: string;            // <style> 块提取的 CSS
  customCSS: string[];             // css 本地文件路径
  remoteCSS: string[];             // remoteCSS 远程 URL
  bg?: string;                     // 全局默认背景
}
