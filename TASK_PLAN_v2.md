# reveal-for-obsidian — AI 开发任务规划

> **项目代号**: `reveal-for-obsidian`  
> **目标**: 基于 reveal.js 6.x 的 Obsidian 幻灯片插件，Markdown 笔记直接转演示文稿。  
> **核心原则**: 不内置任何主题，所有版面由 `<grid>` 精确定位 + `style` 直接写 CSS 搭建。  
> **面向**: AI 辅助开发，每阶段任务可直接转化为代码实现。

---

## 〇、命名与范围

1. **产品名**：统一为 `reveal-for-obsidian`（manifest 的 id/name、项目代号、产物目录均用此名）。
2. **VSCode 扩展**：README 有专节。本规划列为 **Phase 6（可选）**，若时间紧可砍掉，不影响插件主体；做的时候再把 `processors/`、`transformers/` 抽出共享层即可（YAGNI，暂不预置）。
3. **本地预览服务器**：这是 iframe 加载 reveal.js 资源的**承载机制**，不是可选项，Phase 0 必须落地（见 Task 0.6）。

---

## 一、技术基线

| 项 | 选型 | 理由 |
|----|------|------|
| reveal.js | `^6.0.1` | Scroll View、Lightbox、内置 TypeScript 类型、MathJax 4 |
| Obsidian API | `obsidian@latest` | 桌面端优先，移动端后续适配 |
| 构建工具 | `esbuild` | 与 Obsidian 插件生态一致，watch 模式快 |
| 语言 | TypeScript 5.x | reveal.js 6 内置 TypeScript 类型 |
| 包管理 | `npm` | 标准，无特殊需求 |
| 测试 | `vitest` | 与 esbuild 生态兼容，支持快照测试 |
| 本地服务 | Node `http`（内置） | 预览服务器，无需额外依赖 |

### reveal.js 6.x 资源加载路径（已核实）

```
# 资源加载路径（npm 包内）
reveal.js/reveal.css              # 主样式
reveal.js/reset.css               # 基础重置样式（需与 reveal.css 一起引入）
reveal.js/dist/reveal.mjs         # ESM 入口
reveal.js/dist/plugin/notes.js    # 核心插件
reveal.js/dist/plugin/highlight.js
reveal.js/dist/plugin/math.js
reveal.js/dist/plugin/zoom.js
```

> 说明：
> - 插件同时提供 `.js`（UMD）与 `.mjs`（ESM）两种构建；本插件用 **esbuild 打包**（见 Task 0.6），通过裸模块名 `reveal.js` / `reveal.js/plugin/notes` 引入，由包的 exports 字段解析，无需手写上述路径。
> - highlight 插件的主题 CSS 位于 `dist/plugin/highlight/*.css`，按需引入。
> - 以上按官方 6.0 升级指南核实，仍需在 Phase 0 对照 `node_modules/reveal.js` 实测一次。

### reveal.js 6.x TypeScript 类型（内置）

```typescript
// reveal.js 6.x 内置类型
import Reveal, { RevealApi, RevealConfig } from 'reveal.js';
```

---

## 二、项目目录结构（最终态）

```
reveal-for-obsidian/
├── manifest.json                 # 插件元数据
├── package.json                  # 依赖: reveal.js@^6.0.1, obsidian, esbuild, vitest, sass
├── esbuild.config.mjs            # 构建配置（含 reveal.js 资源打包）
├── vite.config.ts                # Vitest 测试配置
├── tsconfig.json                 # TS 配置
├── .eslintrc.cjs                 # ESLint（README 提到 yarn lint）
├── LICENSE                       # MIT
│
├── src/
│   ├── main.ts                   # 插件入口: 注册命令、视图、设置页、生命周期
│   ├── constants.ts              # 常量: 默认配置、分隔符正则、画布基准值
│   │
│   ├── types/
│   │   ├── index.ts              # 全局类型导出
│   │   ├── config.ts             # 插件配置接口 (PluginSettings) + 默认值
│   │   ├── slide.ts              # 幻灯片相关类型 (Slide, SlidePage, SlideNote)
│   │   └── grid.ts               # Grid 元素类型 (GridElement, GridAttribute)
│   │
│   ├── settings/
│   │   └── index.ts              # 设置页 UI (PluginSettingTab)
│   │
│   ├── commands/
│   │   └── index.ts              # 命令注册: Preview, Reload, Start/Stop Server, Export
│   │
│   ├── views/
│   │   └── SlidePreviewView.ts   # 侧边预览面板 (iframe 隔离)
│   │
│   ├── server/
│   │   └── previewServer.ts      # 本地 HTTP 服务器：给 iframe 提供 reveal 资源 + 渲染结果
│   │
│   ├── processors/               # Markdown → 结构化数据 管线
│   │   ├── index.ts              # 管线编排器 PipelineOrchestrator
│   │   ├── frontmatter.ts        # Frontmatter 提取器（含 size YAML 1.1 还原）
│   │   ├── cssProcessor.ts       # <style> 块提取为文档级 CSS
│   │   ├── slideSplitter.ts      # 幻灯片分页器 (--- / xxx)
│   │   ├── gridParser.ts         # <grid> 标签解析器
│   │   ├── splitParser.ts        # <split> 标签解析器
│   │   ├── noteProcessor.ts      # note: 演讲者备注提取（分页后逐页）
│   │   ├── imageProcessor.ts     # wikilink 图片尺寸 / 视频 / Excalidraw
│   │   ├── svgProcessor.ts       # ```svg 代码块 → data URI 图片
│   │   ├── chartProcessor.ts     # ```chart → Chart.js 图表
│   │   ├── mermaidProcessor.ts   # ```mermaid → Mermaid 图表
│   │   ├── codeBlockProcessor.ts # 代码块标记与长代码自适应
│   │   ├── elementComment.ts     # <!-- .element: --> / <!-- .slide: --> 处理
│   │   ├── calloutProcessor.ts   # Obsidian Callout 适配（样式层面）
│   │   ├── footnoteProcessor.ts  # 脚注 / Emoji / Font Awesome（如渲染器未覆盖）
│   │   └── embedProcessor.ts     # ```slide 嵌入其他笔记的单页
│   │
│   ├── transformers/             # 属性 → CSS/HTML 转换器
│   │   ├── index.ts              # 转换器注册表 TransformerRegistry
│   │   ├── grid.ts               # dimension / position / absolute → 尺寸定位 CSS
│   │   ├── shape.ts              # shape="hexagon" → clip-path
│   │   ├── style.ts              # style="..." → 内联样式透传
│   │   ├── class.ts              # class="..." → HTML class
│   │   ├── fragment.ts           # frag="1" → reveal.js fragment
│   │   ├── animate.ts            # animate="fade-in" → CSS 动画类
│   │   └── backgroundImage.ts    # data-background-* → 幻灯片背景
│   │
│   ├── engine/
│   │   ├── renderEngine.ts       # MarkdownRenderer 封装（Markdown → HTML 字符串）
│   │   ├── revealEngine.ts       # reveal.js 初始化与配置注入
│   │   ├── reveal-bundle.ts      # esbuild 打包入口：bundle reveal.js + 插件 → dist/assets/reveal.bundle.mjs
│   │   ├── templateEngine.ts     # HTML 模板渲染 (reveal.html 模板字符串)
│   │   ├── canvasCalculator.ts   # 画布尺寸与根字号计算
│   │   └── scrollViewHandler.ts  # Scroll View 模式管理
│   │
│   ├── export/
│   │   ├── pdfExporter.ts        # 打印视图生成
│   │   ├── htmlExporter.ts       # 独立 HTML 打包导出
│   │   ├── assetLocalizer.ts     # vault 资源引用收集与相对路径改写（纯函数）
│   │   ├── exportPaths.ts        # 导出目录/文件名的公共处理
│   │   ├── pptxExporter.ts       # PPTX 导出编排（读媒体、栅格化 SVG、落盘）
│   │   ├── slideOutline.ts       # 页面 HTML → 区域 + 块大纲（纯函数）
│   │   ├── pptxLayout.ts         # 大纲 → 带坐标的形状（纯计算）
│   │   ├── pptxBuilder.ts        # 形状 → OOXML 各部件（纯字符串）
│   │   ├── imageMeta.ts          # 图片原始尺寸探测（纯字节解析）
│   │   └── zipWriter.ts          # 最小 ZIP 写入器（.pptx 即 OPC zip 包）
│   │
│   ├── template/
│   │   ├── reveal.html           # 渲染用 reveal.js 模板
│   │   └── embed.html            # 独立导出/打印用模板
│   │
│   ├── styles/
│   │   ├── main.scss             # 插件主样式入口
│   │   ├── grid.scss             # .grid 容器默认样式 + 长代码自适应
│   │   ├── split.scss            # .split 分栏样式
│   │   ├── reveal-overrides.scss # 覆盖 reveal.js 默认主题样式 + callout 样式
│   │   └── canvas.scss           # 画布尺寸与字号缩放
│   │
│   └── utils/
│       ├── pathResolver.ts       # Vault 内资源路径解析
│       ├── debounce.ts           # 防抖工具
│       └── dom.ts                # DOM 操作辅助
│
├── vscode/                       # Phase 6（可选）：VSCode 扩展，复用 processors/ 与 transformers/
│
├── tests/
│   ├── processors/               # 处理器单元测试
│   ├── transformers/             # 转换器单元测试
│   ├── engine/                   # 引擎集成测试
│   └── fixtures/                 # 测试用 Markdown 文件
│
└── dist/                         # 构建产物 (esbuild 输出)
    ├── main.js                   # 插件主入口
    ├── styles.css                # 编译后的 CSS
    ├── manifest.json             # 复制自根目录
    └── assets/                   # reveal.js 打包产物（reveal.bundle.mjs + reveal.css/reset.css）
```

---

## 三、核心类型定义（先写这些，后续模块依赖）

> `PluginSettings` 是纯 TS 类型，不依赖 `obsidian`，接口与默认值都放 `src/types/config.ts`；设置页 UI 在 `src/settings/index.ts`。若后续做 VSCode 扩展，再抽共享层（见「命名与范围」）。

### `src/types/config.ts`

```typescript
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

  // 预览
  previewMode: 'tab' | 'sidebar';  // 预览开在标签页还是侧边栏
  scrollActivationWidth: number | null; // reveal.js 自动滚动视图阈值，null=禁用
  autoReload: boolean;
  autoComplete: boolean;
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
  previewMode: 'sidebar',
  scrollActivationWidth: null,
  autoReload: true,
  autoComplete: true,
};
```

### `src/types/slide.ts`

```typescript
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
```

### `src/types/grid.ts`

```typescript
export interface GridElement {
  tag: 'grid';
  dimension: [number, number];     // [宽%, 高%]（绝对模式时单位为 px）
  position: [string, string];      // 已规范化的 [left, top] CSS 值（含 % / calc / px）
  anchor: [string, string];        // 元素自身回移量 [x, y] → transform: translate()
  absolute: boolean;               // 是否按 px 解释
  style: string;                   // 内联 CSS
  className: string;
  shape: string | null;
  fragment: string | null;
  animate: string | null;
  children: string;                // 内部 HTML 内容（已渲染过的 Markdown）
}

export interface SplitElement {
  tag: 'split';
  even: boolean;
  gap: number;                     // em
  left: number;
  right: number;
  wrap: number | null;
  noMargin: boolean;
  columns: string[];               // 每栏内容
}
```

> 说明：`position` 在 **parser 阶段就规范化为最终 CSS 值**（关键字、负数都转成 `%` / `calc()`），Transformer 只做格式化拼接，避免双重映射（见 Task 2.1 / 2.3）。
>
> ⚠️ `position` 单独用不够：`left/top` 定位的是元素**左上角**，关键字（`center` / `bottomright`）与负数写法要表达的却是「元素的中心/右下角对齐到该点」。所以 parser 同时产出 `anchor`，由 Transformer 输出 `transform: translate(ax, ay)`。否则 `position="bottomright"` 会把元素整块推出画布（实现期实测，见 §十）。

---

## 四、分阶段开发计划（AI 可直接执行）

> 按步骤顺序执行，完成一个 Phase 的验收标准（= 完成定义）再进入下一个。任务间存在依赖时已在上文标注。

### Phase 0: 骨架搭建 + reveal.js 资源加载

**目标**: 项目可构建，能在 Obsidian 中加载为有效插件，打开一个空的 reveal.js 6.x 预览面板，且 reveal 资源加载链路打通。

#### Task 0.1: 项目初始化
- **输入**: 空目录
- **输出**: `package.json`, `manifest.json`, `tsconfig.json`, `esbuild.config.mjs`, `vite.config.ts`, `.eslintrc.cjs`
- **文件**:
  - `manifest.json`: id=`reveal-for-obsidian`, name=`reveal-for-obsidian`, version=`0.1.0`, minAppVersion=`0.15.0`
  - `package.json`: deps=`reveal.js@^6.0.1`, `obsidian`; devDeps=`esbuild`, `typescript`, `vitest`, `sass`, `eslint`
  - `esbuild.config.mjs`: entry=`src/main.ts`, outdir=`dist/`, external=`['obsidian', 'electron', '@codemirror/*', '@lezer/*']`, format=`cjs`, target=`es2018`
  - `vite.config.ts`: 配置 vitest 测试环境为 `happy-dom`
  - `src/types/config.ts`: 设置类型 + 默认值
- **额外**: `git init` + 初始 commit（当前目录尚不是 git 仓库）
- **验收**: `npm install && npm run build` 成功生成 `dist/main.js` 和 `dist/styles.css`

#### Task 0.2: 插件主入口
- **输入**: Obsidian Plugin API
- **输出**: `src/main.ts`
- **实现**:
  ```typescript
  import { Plugin } from 'obsidian';
  import { DEFAULT_SETTINGS, PluginSettings } from './types/config';
  import { RevealSettingTab } from './settings';
  import { SlidePreviewView, VIEW_TYPE_SLIDE_PREVIEW } from './views/SlidePreviewView';

  export default class RevealPlugin extends Plugin {
    settings: PluginSettings;

    async onload() {
      await this.loadSettings();
      this.registerView(VIEW_TYPE_SLIDE_PREVIEW, (leaf) => new SlidePreviewView(leaf, this));
      this.addSettingTab(new RevealSettingTab(this.app, this));
      // 注册命令见 Task 0.3；服务器见 Task 0.6
    }

    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }
  }
  ```
- **验收**: 复制 `dist/` 到 Obsidian 插件目录，重启后能在「第三方插件」中启用，无报错

#### Task 0.3: 基础命令注册
- **输出**: `src/commands/index.ts`
- **命令列表**:
  1. `Show Slide Preview` (id: `show-slide-preview`) → 打开/聚焦预览面板
  2. `Reload Slide Preview` (id: `reload-slide-preview`) → 强制刷新
  3. `Start Slide Preview Server` (id: `start-server`) → 启动本地服务（Task 0.6 后补）
  4. `Stop Slide Preview Server` (id: `stop-server`) → 停止服务
- **快捷键**: `Ctrl/Cmd + Shift + E` 绑定命令 1，`Ctrl/Cmd + Shift + R` 绑定命令 2
- **验收**: 命令面板能搜到这些命令，执行后无报错

#### Task 0.4: 设置页框架
- **输出**: `src/settings/index.ts`
- **实现**: 继承 `PluginSettingTab`，展示所有 `PluginSettings` 字段的基础表单（文本框、开关、下拉框、数字输入）
- **验收**: 打开设置页能看到所有配置项，修改后调用 `saveSettings()`

#### Task 0.5: 预览面板空壳
- **输出**: `src/views/SlidePreviewView.ts`
- **实现**:
  - 继承 `ItemView`，`getViewType()` 返回 `VIEW_TYPE_SLIDE_PREVIEW`
  - `onOpen()` 时在容器内创建一个 `<iframe>`
  - iframe 的 `src` 指向本地预览服务器（Task 0.6），`sandbox` 含 `allow-scripts allow-same-origin`
- **验收**: 点击命令后侧边栏出现「Slide Preview」标签（内容此时可先为占位，Phase 1 后才有幻灯片）

#### Task 0.6: reveal.js 资源打包 + 本地预览服务器 ⚠️（关键）
- **输出**: `src/server/previewServer.ts` + 修改 `esbuild.config.mjs`
- **背景**: Obsidian 插件无法让 iframe 直接引用 `node_modules`。采用**本地 HTTP 服务器**方案（与原版 obsidian-advanced-slides 一致）。
- **esbuild 双入口**:
  1. `src/main.ts` → `dist/main.js`（CJS，external `obsidian`，不含 reveal.js）
  2. `src/engine/reveal-bundle.ts` → `dist/assets/reveal.bundle.mjs`（ESM，`import Reveal from 'reveal.js'` + `import 'reveal.js/plugin/notes'` 等裸模块名，由 esbuild 打包 reveal.js 与插件）
  3. 构建脚本把 `node_modules/reveal.js/reveal.css`、`reset.css` 复制到 `dist/assets/`
- **服务器**:
  1. 插件 `onload` 时按 `settings.port` 启动 `http.createServer()`，监听 `127.0.0.1:port`
  2. 路由：`/reveal.html`（模板，引用 `assets/reveal.bundle.mjs` + `assets/reveal.css` + `assets/reset.css`）；`/assets/*`（静态返回 `dist/assets/`）；`/deck`（POST，返回当前 SlideDeck，供实时刷新）
  3. iframe `src` = `http://127.0.0.1:${port}/reveal.html`
- **安全**: 仅监听 `127.0.0.1`；`onunload` 时关闭服务器
- **验收**: 启动插件后 `curl http://127.0.0.1:3000/reveal.html` 能返回含 reveal 样式的页面；ifame 能显示 reveal.js 默认空幻灯片（至少 1 页 `<section>Empty</section>`）、能翻页
- **备选方案（记录，不采用）**: 把 reveal.js 全部内联进 `srcdoc`（体积大、`<script type=module>` 在 sandbox 内受限）；或依赖 `app.vault.getResourcePath()`（MIME 不可控）。本地服务器为推荐路径。

---

### Phase 1: Markdown → 幻灯片管线

**目标**: 将当前编辑的 Markdown 笔记解析为 `SlideDeck` 结构，并在预览面板渲染为多页 reveal.js 幻灯片。

#### Task 1.1: Frontmatter 提取器
- **输出**: `src/processors/frontmatter.ts`
- **接口**:
  ```typescript
  export function extractFrontmatter(markdown: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  }
  ```
- **实现**: 正则 `/^---\s*\n([\s\S]*?)\n---\s*\n/` 提取 YAML，用 `js-yaml`（或 `obsidian` 内置的 `parseYaml`）转对象。**关键**: 还原 YAML 1.1 把 `16:9` 解析成 `969` 的问题（`size` 字段做还原）
- **验收**: 输入含 frontmatter 的字符串，正确分离 frontmatter 和 body；`size: 16:9` 解析为 `"16:9"`

#### Task 1.2: 幻灯片分页器
- **输出**: `src/processors/slideSplitter.ts`
- **接口**:
  ```typescript
  export function splitSlides(body: string, separator: string, verticalSeparator: string): {
    slides: { content: string; type: 'horizontal' | 'vertical' }[];
  }
  ```
- **实现**:
  - 先用水平分隔符分割，每块再检查内部是否含垂直分隔符
  - **关键**: 先正则标记代码块（```...```）范围，分割时跳过这些范围内的分隔符；行内代码同理
  - `headingDivider` 支持：按指定级别标题切分
- **验收**: 测试覆盖：正常分页、代码块内含 `---` 不分页、垂直分页嵌套、headingDivider 分页

#### Task 1.3: Markdown 渲染器
- **输出**: `src/engine/renderEngine.ts`
- **接口**:
  ```typescript
  export async function renderMarkdownToHtml(
    app: App,
    markdown: string,
    sourcePath: string,
    component?: Component
  ): Promise<string>
  ```
- **实现**: 调用 `MarkdownRenderer.renderMarkdown(markdown, element, sourcePath, component)`，将结果转 HTML 字符串。**注意**: 此渲染器同时承担 grid 内部 Markdown 的二次渲染（见管线契约）
- **验收**: `# Title\n\nParagraph` → 含 `<h1>Title</h1>`、`<p>Paragraph</p>`

#### Task 1.4: 管线编排器（MVP 版）
- **输出**: `src/processors/index.ts`
- **实现**: 按「五、管线执行顺序」编排（frontmatter → css → 分页 → grid/split 占位符 → 渲染 → 后处理 → 模板）。MVP 先跑通：frontmatter + 分页 + 渲染 + 模板
- **验收**: 一篇含 `---` 分隔的笔记，输出 `SlideDeck`，页数正确、每页 `html` 已渲染

#### Task 1.5: reveal.js 引擎集成
- **输出**: `src/engine/revealEngine.ts`, `src/engine/templateEngine.ts`
- **接口**:
  ```typescript
  export class RevealEngine {
    constructor(private iframe: HTMLIFrameElement);
    async init(deck: SlideDeck): Promise<void>;
    async reload(deck: SlideDeck): Promise<void>;
    destroy(): void;
  }
  ```
- **实现**:
  - `templateEngine.ts` 用 `reveal.html` 模板字符串生成完整页面（含 `<div class="reveal"><div class="slides">`）
  - 将 `SlideDeck.pages` 的 `html` 注入为 `<section>`；垂直子页嵌套为 `<section>` 内的 `<section>`
  - 通过服务器 `/deck` 接口把渲染结果推给 iframe，iframe 内 `import('/assets/reveal.bundle.mjs')` 后 `new Reveal(config)` 初始化
- **验收**: 预览面板显示多页幻灯片，翻页正常，配置项生效

#### Task 1.6: 实时刷新
- **输出**: 修改 `src/views/SlidePreviewView.ts`
- **实现**:
  - 监听当前笔记 `vault.on('modify', ...)`，防抖 300ms 后重跑管线 + 推送刷新
  - 监听 `workspace.on('active-leaf-change', ...)` 切换预览
  - 优先只刷新当前页（增量），必要时全量 reload
- **验收**: 编辑笔记时预览 300ms 后自动更新

---

### Phase 2: Grid 定位系统

**目标**: 完整实现 `<grid>` 和 `<split>` 标签的解析、转换与渲染。

#### Task 2.1: Grid 标签解析器（含 position 规范化）
- **输出**: `src/processors/gridParser.ts`
- **接口**:
  ```typescript
  export function parseGridTags(html: string): {
    html: string;  // 替换后的 HTML（占位符）
    grids: GridElement[];
  }
  ```
- **实现**:
  - 正则匹配 `<grid\s+([^>]*)>([\s\S]*?)</grid>`，替换为 `<!--GRID_0-->` 占位符
  - 解析属性: `dimension`, `position`, `absolute`, `style`, `class`, `shape`, `frag`, `animate`
  - **position 规范化（在此一处完成，Transformer 不再重复映射）**，同时产出 `anchor`（元素自身回移量）:
    ```typescript
    // position                          anchor
    // "20 25"     → ['20%','25%']       ['0','0']          // 数值 = 左上角对齐
    // "top"       → ['50%','0%']        ['-50%','0']       // 单关键字: 另一轴居中
    // "topleft"   → ['0%','0%']         ['0','0']
    // "topright"  → ['100%','0%']       ['-100%','0']
    // "bottomright" → ['100%','100%']   ['-100%','-100%']
    // "center"    → ['50%','50%']       ['-50%','-50%']
    // "-6 -8"     → ['calc(100% - 6%)', 'calc(100% - 8%)']  ['-100%','-100%']  // 距右/下边缘
    // absolute=true → 单位用 px；非法数值（如 "20%"）回落到 0，不得产生 NaN
    // 规则: 关键字 anchor = -该百分比；负数 anchor = -100%；非负数值 anchor = 0
    ```
- **验收**: 各 position 写法输出规范化后的 `[left, top]` 与 `anchor`；grid 替换为占位符

#### Task 2.2: Grid 转换器（dimension / position / absolute）
- **输出**: `src/transformers/grid.ts`
- **实现**:
  ```typescript
  export class GridTransformer {
    transform(grid: GridElement): string {
      const unit = grid.absolute ? 'px' : '%';
      const [w, h] = grid.dimension;
      const [left, top] = grid.position; // 已规范化，直接拼接
      const [ax, ay] = grid.anchor;
      const base = `position: absolute; width: ${w}${unit}; height: ${h}${unit}; left: ${left}; top: ${top};`;
      // anchor 全零（数值定位）时不输出 transform，避免干扰用户自定义 transform
      return ax === '0' && ay === '0' ? base : `${base} transform: translate(${ax}, ${ay});`;
    }
  }
  ```
- **验收**: `dimension="60 30" position="20 25"` → `position: absolute; width: 60%; height: 30%; left: 20%; top: 25%;`（无 transform）；`position="-6 -8"` → `left: calc(100% - 6%); top: calc(100% - 8%); transform: translate(-100%, -100%);`；`position="center"` → `left: 50%; top: 50%; transform: translate(-50%, -50%);`

#### Task 2.3: Shape 转换器
- **输出**: `src/transformers/shape.ts`
- **实现**: 内置 12 种图形 `clip-path` 映射（circle/ellipse/triangle/triangle-down/diamond/hexagon/pentagon/star/arrow/chevron/parallelogram/ribbon），表外值原样透传
- **验收**: `shape="hexagon"` → `clip-path: polygon(25% 0%, ...);`

#### Task 2.4: Style / Class / Fragment / Animate / BackgroundImage 转换器
- **输出**: `src/transformers/style.ts`, `class.ts`, `fragment.ts`, `animate.ts`, `backgroundImage.ts`
- **实现**:
  - style → 内联样式透传；class → HTML class；frag → reveal fragment 属性；animate → CSS 动画类
  - backgroundImage → 把 `data-background-*` 属性挂到 `<section>`（或注入背景 CSS）
- **验收**: 各转换器输出正确 CSS/HTML 属性

#### Task 2.5: Grid 渲染器
- **输出**: 修改 `src/processors/index.ts` 管线
- **实现**:
  - Markdown 渲染后提取 grid，逐个调用转换器生成 CSS，替换占位符:
    ```html
    <div class="grid" style="{generatedCSS}; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      {grid.children}
    </div>
    ```
  - **grid.children 是已渲染的 HTML**（对 grid 内部 Markdown 二次调用 renderMarkdownToHtml）
- **验收**: 红块示例渲染到正确位置与尺寸

#### Task 2.6: Split 标签解析器
- **输出**: `src/processors/splitParser.ts`
- **实现**: 匹配 `<split>`，按空行分栏，生成 flex 容器（`even` → 等宽；`left`/`right` → 权重；`wrap` → 换行；`gap` → 间距 em）
- **验收**: `<split even gap="2">` 生成等宽双栏，间距 2em

#### Task 2.7: CSS 样式系统
- **输出**: `src/styles/grid.scss`, `split.scss`, `canvas.scss`, `reveal-overrides.scss`
- **实现**: `.grid`（absolute + flex 居中）、`.split`（flex）、画布 CSS 变量（`--canvas-width/height/root-font-size`）
- **⚠️ 画布高度（实现期实测补充）**: reveal.js 的 `<section>` 默认 `height: auto`，grid 的 `height` / `top` 百分比会**塌成 0**（整页看起来是空白）。含 grid 的页必须标记为固定画布：`templateEngine` 给该 `<section>`（含垂直栈的外层）加 `rfo-canvas` class，CSS 置 `height: 100%; top: 0 !important; padding: 0`（`center: true` 时 reveal 会写内联 `top`，需压掉）。纯文本页不加，保留 reveal 原生垂直居中。
- **`--root-font-size` 必须真正注入**：`canvasCalculator.computeRootFontSize` 的结果要由 iframe 客户端写到 `document.documentElement`，否则 `autoFontScale` / `fontScale` 两个设置项形同虚设。
- **验收**: SCSS 编译后 Grid/Split 布局正确；`position="bottomright"` 的块贴在画布右下角内侧且高度非 0

---

### Phase 3: Obsidian 生态集成

**目标**: 完整支持 Obsidian 原生语法。

#### Task 3.1: 图片 / 视频 / Excalidraw 处理器
- **输出**: `src/processors/imageProcessor.ts`
- **实现**:
  - 依赖 `MarkdownRenderer` 已把 `![[image.png]]` 渲染为 `<img src="{resourcePath}">`，本处理器做**后处理**：
    - `![[image.png|800]]` → `<img width="800">`；`|800x600` → 宽高
    - 视频扩展名（mp4/webm/ogv/mov/m4v）→ 包一层带播放控件的 `<video>`
    - `.excalidraw` → 渲染为 Excalidraw 预览图
  - 标准 `![alt](url)` 原样保留
- **验收**: Vault 内图片/视频/Excalidraw 正确显示，尺寸参数生效

#### Task 3.2: SVG 代码块处理器
- **输出**: `src/processors/svgProcessor.ts`
- **实现**: 匹配 `` ```svg ... ``` ``，提取 `<svg>` 转 `data:image/svg+xml;base64,...` 的 `<img>`（仅当内容含 `<svg` 才转换）
- **验收**: SVG 代码块渲染为图片，非代码

#### Task 3.3: Callout 适配
- **输出**: `src/processors/calloutProcessor.ts` + `reveal-overrides.scss`
- **实现**: `MarkdownRenderer` 已渲染 callout，本任务只在 `reveal-overrides.scss` 覆盖 reveal 的 blockquote 样式，保留 Obsidian callout class
- **验收**: `> [!note] 提示` 渲染为带图标 callout

#### Task 3.4: 代码块适配（长代码自动缩小）
- **输出**: `src/processors/codeBlockProcessor.ts` + `grid.scss`
- **实现**（JS 测量，非纯 CSS）:
  1. 渲染后对 `.grid` 内 `pre` 测量 `scrollHeight` vs 容器 `clientHeight`
  2. 溢出时递减 `font-size` / `line-height`（线性或二分），直到 `scrollHeight ≤ clientHeight` 或达下限
  3. 下限仍溢出则 `transform: scale()` 兜底；短代码保持垂直/水平居中
- **验收**: 长代码在固定尺寸 grid 内自动缩小、不溢出、无滚动条

#### Task 3.5: Element Comment 处理器
- **输出**: `src/processors/elementComment.ts`
- **实现**: `<!-- .element: -->` 作用于紧邻上一元素；`<!-- .slide: -->` 作用于当前 `<section>`；块级元素 comment 写在下一行
- **验收**: 正确修改前一个元素样式 / 当前页属性

#### Task 3.6: 脚注 / Emoji / Font Awesome
- **输出**: `src/processors/footnoteProcessor.ts`（如 Obsidian 渲染器未覆盖）
- **实现**: 脚注（`[^1]`）、Emoji 短代码、` :fas_*:` / `:fab_*:` Font Awesome 图标 —— 优先复用 `MarkdownRenderer` 已有能力，仅在不支持时补处理器 + 引入对应资源
- **验收**: 三类语法在幻灯片中正确渲染

---

### Phase 4: 增强功能

**目标**: 图表、公式、演讲者工具、reveal.js 6.x 新特性。

#### Task 4.1: Mermaid 图表
- **输出**: `src/processors/mermaidProcessor.ts`
- **实现**: 匹配 `` ```mermaid ```，本地打包 `mermaid@10`（避免 CDN 离线失效），渲染为 SVG
- **验收**: Mermaid 流程图正确显示

#### Task 4.2: Chart.js 图表
- **输出**: `src/processors/chartProcessor.ts`
- **实现**: 匹配 `` ```chart ```（type/labels/series YAML），本地打包 Chart.js，渲染为 canvas/图片
- **验收**: 柱状/折线等图表正确显示

#### Task 4.3: MathJax 4 公式
- **输出**: 复用 reveal.js 6.x 内置 MathJax 4
- **实现**: 初始化加载 `reveal.js/dist/plugin/math.js`，配置 `math: { mathjax: '<local-or-cdn>', config: 'tex-svg' }`
- **验收**: `$...$` / `$$...$$` 正确渲染

#### Task 4.4: Scroll View / Lightbox
- **输出**: `src/engine/scrollViewHandler.ts` + `revealEngine.ts`
- **实现**: 侧边栏预览可能触发 reveal 自动滚动阈值，用 `scrollActivationWidth: null` 禁用；启用 `lightbox: true`
- **验收**: 侧边栏不误切滚动视图；图片可点击放大

#### Task 4.5: 演讲者备注
- **输出**: `src/processors/noteProcessor.ts`
- **实现**: **分页后逐页**提取末尾 `notesSeparator`（默认 `note:`）块，注入 `<aside class="notes">`。备注可为多行 Markdown
- **验收**: 按 `S` 打开演讲者视图可见备注

#### Task 4.6: 幻灯片嵌入
- **输出**: `src/processors/embedProcessor.ts`
- **实现**: 匹配 `` ```slide ``` ``（slide/page），读取目标笔记 → 解析为 SlideDeck → 提取指定页嵌入当前页
- **验收**: 能嵌入其他笔记的单页幻灯片

#### Task 4.7: CSS 变量系统
- **输出**: `src/processors/cssProcessor.ts`
- **实现**: 提取 `<style>` 块为文档级 CSS，注入模板；支持 `:root { --brand: ... }` 定义，grid 的 `style` 可 `var(--brand)` 引用
- **验收**: 定义变量后 grid 正确引用

---

### Phase 5: 导出与发布

**目标**: PDF / HTML / PPTX 导出，文档，社区发布。

#### Task 5.1: PDF 导出
- **输出**: `src/export/pdfExporter.ts`
- **实现**: 生成 `?print-pdf` 打印视图，打开新标签页，提示「打印 → 另存为 PDF」
- **验收**: 打印视图分页正确、样式完整

#### Task 5.2: HTML 独立导出
- **输出**: `src/export/htmlExporter.ts`
- **实现**: 收集本地图片复制到输出目录；打包 reveal 资源 + 渲染后 HTML；路径改相对路径
- **验收**: 导出文件夹脱离 Obsidian 可正常播放

#### Task 5.2b: PPTX 导出（可编辑）
- **输出**: `src/export/{pptxExporter,slideOutline,pptxLayout,pptxBuilder,imageMeta,zipWriter}.ts`
- **实现**: 页面 HTML → 区域(grid/split/安全区) + 块(段落/图片/表格) → 带 EMU 坐标的形状 →
  手写 OOXML（PresentationML）→ 自写 ZIP 打包。文字/图片/表格是 PowerPoint 原生对象，可直接编辑；
  `<grid>` 百分比按**整块画布**换算，与预览版面一致；SVG 用 Chromium 栅格化成 PNG 嵌入；
  `note:` 备注进 notesSlide。
- **不支持**（浏览器专属，留灰色占位框提示）: mermaid / Chart.js / 视频 / CSS 动画 / 远程图片
- **验收**: 生成的 .pptx 用 Office / WPS 打开无「文件已损坏」提示，版面与预览比例一致
- **验证手段**: 单测覆盖纯函数各层；打包后用 .NET `ZipFile` + `[xml]` 校验
  「XML 均良构 / 关系无悬空 / rId 均有定义 / 部件均有 content type」

#### Task 5.3: 文档与示例
- **输出**: `README.md`, `docs/tutorial.md`, `examples/demo.md`
- **验收**: 新用户按 README 能独立完成第一篇幻灯片

#### Task 5.4: 社区发布
- **输出**: 提交 `obsidian-releases`
- **验收**: PR 合并，社区插件列表可搜到

---

### Phase 6: VSCode 扩展（可选）

**目标**: 非 Obsidian 环境预览同一套 Markdown 幻灯片（README 有专节）。若时间紧可 descope。

#### Task 6.1: VSCode 扩展骨架
- **输出**: `vscode/` 扩展，复用 `processors/`、`transformers/`、`src/types/`
- **关键**: 共享逻辑不得 import `obsidian`，Markdown 渲染用通用渲染器替代 `MarkdownRenderer`
- **验收**: VSCode 中打开 `.md` 能预览幻灯片

---

## 五、关键接口契约（模块间约定）

### Processor 接口

```typescript
export interface Processor {
  name: string;
  process(input: string, context: ProcessorContext): string | Promise<string>;
}

export interface ProcessorContext {
  app: App;
  sourcePath: string;
  settings: PluginSettings;
  frontmatter: Record<string, unknown>;
}
```

### Transformer 接口

```typescript
export interface Transformer {
  name: string;
  transform(grid: GridElement): string;  // 返回 CSS 字符串片段
}
```

### 管线执行顺序（不可变）

```
 1. frontmatter.ts        → 提取配置（含 size YAML 还原），分离 body + title + bg
 2. cssProcessor.ts       → 提取 <style> 为文档级 CSS
 3. slideSplitter.ts      → 分页（先标记代码块范围，避免分隔符误识别）
 4. noteProcessor.ts      → 逐页提取 note: 备注（分页后执行，避免跨页边界）
 5. gridParser.ts         → 每页内解析 <grid> → 占位符；position 在此规范化
 6. splitParser.ts        → 每页内解析 <split> → 占位符
 7. renderMarkdownToHtml  → 渲染整页 Markdown（占位符为文本标记 ⟦RFO-GRID-n⟧，渲染器原样保留）
 8.   └─ 对每个 grid.children / split.columns 二次调用 renderMarkdownToHtml
 9. imageProcessor.ts     → wikilink 尺寸 / 视频 / Excalidraw（后处理已渲染的 HTML）
10. svgProcessor.ts       → ```svg → data URI 图片
11. chartProcessor.ts     → ```chart → Chart.js
12. mermaidProcessor.ts   → ```mermaid → SVG
13. codeBlockProcessor.ts → 长代码自适应测量
14. elementComment.ts     → .element: / .slide:
15. 占位符替换             → 调用 Transformer 生成最终 grid/split HTML（多轮，解开嵌套）
16. templateEngine.ts     → 注入 reveal.html 模板 → 推送服务器 /deck
```

> **第 9~14 步的作用范围（易错点）**：此时页面 HTML 里 grid/split 只是占位符注释，内容还在
> `grid.children` / `split.columns` 各自的字符串中。后处理必须**对这三处分别执行**，
> 否则 grid 里的图片不会被改写成 `/vault` 路由（预览直接裂图）、代码块/短代码也不会被转换。
> 各处解析出的 `.slide:` 属性统一并入当前页。
>
> **占位符绝不能用 HTML 注释**：Obsidian 的 MarkdownRenderer 会把 `<!-- ... -->` 整段丢弃。
> 一页正文在解析后往往只剩占位符，渲染结果就是空字符串——整个 deck 每页全白。
> 必须用普通文本标记（`⟦RFO-GRID-0⟧`），渲染器当文字保留，之后再字符串替换。
> 代价是标记会被包进 `<p dir="auto">`，替换时要连段落包装一起处理。
>
> **第 15 步要多轮、且每轮只扫一遍**：grid 里可以放 split、split 里可以放 grid，
> 一轮替换会把内层占位符原样留在插入的 HTML 里（内容整段丢失）。
> 每轮必须用一条正则一次扫描完成（`String.replace` 不重扫刚插入的内容），
> 否则本轮新插入内容的 `<p>` 包装来不及处理，会渲染成 `<p><div class="grid">`。
>
> **代码块保护范围**：`slideSplitter` 的代码块下标必须按**当前被切分的字符串**现算。
> 分页是多轮的（水平 → headingDivider → 垂直），复用整篇正文算出的下标会整体错位，
> 结果是第二页起代码块内的 `xxx` / `---` 照样触发分页。

---

## 六、测试策略

### 单元测试（Vitest）

覆盖每个 processor / transformer 的纯逻辑（不依赖 obsidian，用 mock App）：

- `dimension`/`position`/`shape`/`fragment`/`animate`/`backgroundImage` 转换器
- `gridParser`：各种 position 写法（关键字 / 负数 / 绝对 px）规范化
- `slideSplitter`：代码块内 `---` 不分页、垂直嵌套、headingDivider
- `noteProcessor`：末尾备注提取、跨页不串
- `frontmatter`：`size: 16:9` 的 YAML 1.1 还原

### 集成测试

- 管线整体：一篇完整 Markdown → `SlideDeck` 结构断言（页数、类型、html 片段）
- 快照测试：`tests/fixtures/` 放完整 Markdown，比对生成 HTML 快照，改 processor/transformer 后更新

### 验收清单（每个 Phase 的完成定义）

| Phase | 完成定义（示例） |
|-------|------------------|
| 0 | `npm run build` 通过；插件可启用；`curl` 本地服务返回 reveal 页面；空幻灯片可翻页 |
| 1 | 多页笔记渲染为多页幻灯片；编辑 300ms 后自动刷新 |
| 2 | grid/split 定位、shape、style、fragment、animate、backgroundImage 全部生效 |
| 3 | 图片/视频/Excalidraw/SVG/Callout/代码块/脚注/Emoji/FA 正确渲染 |
| 4 | Mermaid/Chart.js/公式/备注/嵌入/CSS 变量生效 |
| 5 | PDF 打印视图正确；独立 HTML 可离线播放；文档齐全 |
| 6 | VSCode 可预览（若做） |

---

## 七、reveal.js 6.x 初始化配置参考

```typescript
// src/engine/revealEngine.ts
const config: RevealConfig = {
  hash: true,
  slideNumber: deck.config.slideNumber ?? true,
  controls: deck.config.controls ?? true,
  progress: deck.config.progress ?? true,
  center: deck.config.center ?? true,
  transition: deck.config.transition ?? 'slide',
  transitionSpeed: deck.config.transitionSpeed ?? 'default',
  margin: deck.config.margin ?? 0.04,
  width: canvasWidth,
  height: canvasHeight,
  // reveal.js 6.x 新特性
  scrollActivationWidth: null,  // 禁用移动端自动滚动视图
  lightbox: true,               // 启用灯箱
  plugins: [
    RevealNotes,
    RevealHighlight,
    RevealMath,
    RevealZoom,
  ],
};
```

---

## 八、风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| iframe 无法加载 reveal.js 资源 | 高 | 高 | Phase 0 落地本地服务器 + 资源打包，`curl` 验证（Task 0.6） |
| reveal.js 6.x 路径/类型变更 | 中 | 高 | Phase 0 对照 `node_modules/reveal.js` 实测所有路径与 `RevealConfig` 类型，回写本规划 |
| Obsidian API 与 reveal.js DOM 样式冲突 | 高 | 中 | iframe 完全隔离，插件 CSS 与 reveal CSS 不共享 DOM |
| 大文件实时预览卡顿 | 中 | 中 | 300ms 防抖 + 增量刷新（只刷当前页） |
| `<grid>` 与 Markdown 解析冲突 | 中 | 中 | Markdown 渲染前字符串级替换为占位符，不依赖 AST |
| 代码块内分隔符误识别 | 低 | 中 | slideSplitter 先标记代码块范围，分割时跳过 |
| grid 内 Markdown 渲染遗漏 | 中 | 中 | 管线契约明确对 grid.children 二次渲染 |

---

## 九、里程碑

| 里程碑 | 对应 Phase | 可演示产物 |
|--------|-----------|-----------|
| M1 可运行骨架 | 0 | 插件启用 + 空 reveal 幻灯片预览 |
| M2 基础放映 | 1 | Markdown 笔记实时转多页幻灯片 |
| M3 布局系统 | 2 | `<grid>`/`<split>` 精确定位 + shape |
| M4 生态兼容 | 3 | 图片/视频/Callout/代码块/脚注等 |
| M5 完整功能 | 4 | 图表/公式/备注/嵌入/CSS 变量 |
| M6 可发布 | 5 | PDF/HTML/PPTX 导出 + 文档 + 社区上架 |
| M7（可选）VSCode | 6 | VSCode 预览 |

---

## 十、实施回写（2026-08-13，Phase 0–5 完成后实测）

**已核实的 reveal.js 6.0.1 事实**:
- 实际安装版本 6.0.1；exports 裸模块名 `reveal.js`、`reveal.js/plugin/{notes,highlight,math,zoom}` 均可用，类型内置（`RevealConfig`/`RevealApi` 从包根导出）。
- `reveal.css`/`reset.css` 实体文件在 `dist/` 下（exports 已映射根路径）；highlight 主题在 `dist/plugin/highlight/*.css`。
- `scrollActivationWidth?: number` 存在，传 `null` 即禁用自动滚动视图（类型上需 cast）。
- **`lightbox` 配置项在 6.0.1 中不存在**（源码与类型均无），规划的 `lightbox: true` 未采用。
- math 插件默认实现是 MathJax2 且从 CDN 加载；MathJax4 需显式 `RevealMath.MathJax4()`。当前保留默认 + 依赖 Obsidian MarkdownRenderer 预渲染公式，未打包 MathJax。
- `?print-pdf` 由 reveal.js 6 内置检测并注入打印样式，PDF 导出无需额外 pdf.css。

**实现期偏差点**:
- 实时刷新采用 SSE（`/events`）+ 客户端（reveal.bundle.mjs）拉取 `/deck` 重渲染；`RevealEngine` 为插件侧门面，实际初始化在 iframe 内完成。
- `noteProcessor` / `cssProcessor` 提前在 Phase 2 落地（管线槽位需要）；`embedProcessor` 实际插入在分页后、备注提取前（```slide 块内 `note:` 字段会与备注分隔符冲突）。
- Transformer 接口实现为累加式 `TransformerResult { css, classes, attrs }`（规划中单 CSS 字符串返回值无法表达 class/属性）。
- 图片经预览服务器 `/vault/*` 路由供给 iframe（`app://` resource URL 在 iframe 中不可加载，已改写）。
- Excalidraw 仅支持「同名 .png 存在则引用」的最小方案（完整渲染依赖 Excalidraw 插件）。
- Font Awesome 需用户经 `remoteCSS` 自行引入样式；emoji 内置约 60 个短代码映射。

**状态**: Phase 0–5 完成；Task 5.4（社区发布）与 Phase 6（VSCode 扩展）未做。

---

## 十一、代码评审修正（2026-08-13，对照本规划逐条复核）

用浏览器实跑预览服务器 + 单测复核后修正的**功能性缺陷**（均已补回归测试，146 测试通过）：

| # | 问题 | 后果 | 修正 |
|---|------|------|------|
| 1 | grid 关键字/负数位置只写 `left/top`，缺元素自身回移 | `position="bottomright"` 整块推出画布，`center` 只有左上角在中心 | parser 产出 `anchor`，Transformer 输出 `transform: translate()`（见 Task 2.1/2.2） |
| 2 | 含 grid 的 `<section>` 没有确定高度 | `dimension` 的高度百分比塌成 0，**整页空白** | `rfo-canvas` class + `height: 100%`（见 Task 2.7） |
| 3 | 后处理只作用于页面 HTML，跳过 grid/split 内容 | grid 里的图片保持 `app://` 在 iframe 内裂图；```mermaid/chart/emoji 不生效 | 后处理链对页面、grid.children、split.columns 分别执行 |
| 4 | 占位符只替换一轮 | split 里的 grid 内容整段丢失 | 多轮替换；同时补上 grid 内 `<split>` 的解析 |
| 5 | `slideSplitter` 代码块下标按整篇正文算 | 第二页起代码块内的 `---`/`xxx` 仍会分页 | 下标按当前分块现算 |
| 6 | `computeRootFontSize` 写了但没人调用 | `autoFontScale` / `fontScale` 两个设置项无效 | 客户端渲染时写入 `--root-font-size` |
| 7 | `css`（本地 CSS 文件）收进 deck 后无人加载 | 设置页的「Local CSS files」无效 | 渲染后读取 vault 内文件，拼在文档级 CSS 之前（笔记内 `<style>` 优先级更高） |

---

## 十二、补齐实现（2026-08-13，第二轮）

上一轮列出的「仍未实现」项已全部落地，默认端口按要求改为 **3000**：

| 功能 | 实现 | 验证 |
|------|------|------|
| 默认端口 3000 | `DEFAULT_SETTINGS.port = 3000` | 全链路（含 README / 教程）同步 |
| **端口占用自动顺延** | `PreviewServer.start()` 遇 `EADDRINUSE` 顺延重试，最多 10 个端口，Notice 告知实际端口 | 实测：本机 3000 已被 Obsidian 占用 → 自动落到 3001 并正常预览 |
| 端口改完自动重启 | 设置页输入框 `change`（失焦/回车）触发 `restartServer()`，重启后重跑管线 | 图片 URL 带端口，只重启不重渲染会全部裂图，故一并重跑 |
| **实际端口贯穿全链路** | 新增 `plugin.serverBase`，管线 / PDF 导出 / HTML 导出统一取**实际监听端口**而非设置值 | 顺延后导出的资源路径仍能对上 |
| **`<grid>` / `<split>` 嵌套** | 解析改为「由内向外」逐层替换最内层标签（最多 8 层），占位符多轮解开 | 浏览器实测：内层 grid 百分比相对外层计算 |
| **属性自动补全** | `EditorSuggest` 外壳 + 纯函数 `getSuggestContext()`；属性名 + `position`/`shape`/`frag`/`animate` 取值候选，受 `autoComplete` 开关控制 | 12 项单测覆盖触发/过滤/插入文本 |
| **`![[img.png\|800]]` 尺寸** | 从 alt 后缀或 Obsidian `.image-embed` 容器取宽高，落到 `<img>`/`<video>` 本身（iframe 内没有 Obsidian 的 CSS，挂在容器上不生效） | 5 项单测 |
| **fixtures 快照测试** | `tests/fixtures/full-deck.md` + `tests/engine/fixtures.test.ts`，快照覆盖 deck 结构与 `<section>` HTML | `npx vitest -u` 更新 |

**修正的连带问题**: 占位符替换里「脱 `<p>` 包装」与「替换裸占位符」原本在同一轮内先后执行，
导致本轮新插入内容的 `<p>` 包装没人处理（嵌套 grid 会渲染成 `<p><div class="grid">`）。
现拆成两步：每轮先脱包装再替换。

---

## 十三、真实笔记实测修正（2026-08-13，第三轮）

拿一篇 82 个 `<grid>` 的真实课件笔记在 Obsidian 里跑，发现两个**只有真实渲染器才会暴露**的问题：

| # | 问题 | 现象 | 修正 |
|---|------|------|------|
| 1 | **占位符用了 HTML 注释** | Obsidian 的 MarkdownRenderer 直接丢弃 `<!-- ... -->`；页面正文解析后只剩占位符 → **17 页全部 html 为空**（备注正常，因为备注是普通 Markdown） | 占位符改为文本标记 `⟦RFO-GRID-n⟧`；新增 `tests/engine/obsidianRenderer.test.ts`，用「会删注释 + `<p dir="auto">` + 段内换行转 `<br>`」的渲染桩做回归 |
| 2 | `drag` / `drop` 属性不认 | advanced-slides 语法写的笔记，82 个 grid 全落到默认值（满画布 + 居中）叠在一起 | `drag` / `drop` 作为 `dimension` / `position` 的别名支持 |

**教训**：此前所有管线测试的渲染桩都会原样透传 HTML 注释，与真实 Obsidian 行为不符，
导致核心机制（占位符）在单测全绿的情况下完全不可用。涉及外部渲染器的约定，
测试桩必须复刻其**实际行为**（删注释、加属性、合并段落），不能想当然。

**同时按需求调整**：
- 预览面板默认改为**主编辑区右侧分栏**（与笔记并排，同 advanced-slides），设置页可选「独立窗口」或「右侧边栏」。
- 尺寸/位置属性增加短写 **`dim` / `pos`**（优先级最高），`dimension`/`position` 与 `drag`/`drop` 继续可用；
  自动补全候选只列短写，取值补全对三种拼法都生效。
- 新增**版面辅助线**（设置项 `showGridGuides` + 命令 `Toggle Grid Guides`）：
  画布铺 10% 标尺、每个 grid 画虚线边框并标注 `宽×高 @ left top`。
  标注文字取自 `GridTransformer` 输出的 `data-rfo-box` 属性（CSS `content: attr()`），
  用绝对定位伪元素实现，不会变成 flex 子项挤动内容，也不影响导出。
- README 增加「完整教程：从空笔记到一份课件」（7 步走通画布/grid/分栏/插图备注/CSS 变量/辅助线/交付）。
- 辅助线开关在 Slide Preview 面板标题栏加了按钮（`ItemView.addAction`），开着时按钮点亮；
  命令、按钮、设置项走同一入口 `setGridGuides()`，切换只推 deck、不重载 iframe。
- **iframe sandbox 补 `allow-popups` / `allow-popups-to-escape-sandbox` / `allow-modals`**：
  演讲者视图（按 S）要 `window.open`，缺权限时返回 null，而 reveal.js 的 notes 插件
  是先用后判空（`w.marked = ...` 在 `if (!w)` 之前），会抛
  `Cannot set properties of null (setting 'marked')` 打断整页渲染。
  客户端同时把这条报错翻译成可操作的提示。

**光标跟随（第四轮追加）**：编辑器光标所在行 → 预览自动翻到对应页。
- 分页器为每页记录源码起始行 `sourceLine`；`cssProcessor` 剥离 `<style>` 时用**等量空行**占位，
  frontmatter 的行数也计入偏移，否则行号会整体错位。
- 光标监听用 CodeMirror 6 的 `EditorView.updateListener`（Obsidian 的 `editor-change`
  只在内容变化时触发，纯移动光标收不到），同一行内移动不重复推送。
- 服务端 SSE 增加 `{ type: 'goto', page }` 消息，客户端换算成 reveal 的 `[h, v]` 后
  `deck.slide()`；已在目标页则不动，避免打断翻页动画。整个过程不重新拉取 deck。
- 设置项 `syncCursor`（默认开）。

**预览面板入口（第四轮追加）**：标题栏用 `ItemView.addAction` 放了四个按钮
（刷新 / 辅助线 / 导出 PDF / 导出 HTML，辅助线开着时点亮），
`onPaneMenu` 给「⋯」菜单加了同样的导出项与辅助线开关。

**移除 `absolute` 像素定位**：reveal 把画布等比缩放到窗口，百分比在任何屏幕上都成立；
绝对像素只跟画布尺寸绑定，改 `size` 比例后会跑位，属于纯粹的坑。
`dim` / `pos` 现在只接受画布百分比，`GridElement.absolute` 与相关分支一并删除。

---

## 十四、跨平台支持（2026-08-13，第五轮）

**Windows 修正**：`/vault` 路由、Excalidraw 探测、HTML 导出复制资源三处都拿
`app://` URL 里的路径（形如 `/C:/Users/...`）直接当本地路径用。
Windows 上盘符前多一个斜杠、分隔符还反着，比对 `getBasePath()`（`C:\Users\...`）必然失败
—— 结果是**每张图片都 403**。抽出 `src/utils/vaultPath.ts` 统一转换与包含判断
（Windows 大小写不敏感、防 `..` 穿越），13 项单测覆盖两个平台。
该文件**不得 import 'path'**：移动端没有 Node 内置模块，故用纯字符串实现。

**移动端支持**：`isDesktopOnly` 改为 `false`，并把依赖 Node 的模块改成按需动态 import
（`previewServer` 与 `htmlExporter` 顶层 import 了 http/fs/path，一旦求值就崩）。
预览新增**内联通道**：
- `renderInlineShell()` 生成不含 deck 的空壳（资源全内联），用 `blob:` URL 挂到 iframe；
- deck 与跳页指令走 `postMessage`，编辑刷新只发数据，不重建 5 MB 的页面；
- blob 与宿主同源，故 Obsidian 的图片资源可直接加载 —— 因此内联模式**不能加 sandbox**
  （沙箱会让它变成不透明源，图片全裂）；服务器模式仍保持沙箱。
- 桌面端服务器起不来时也退到这条路。
- 移动端禁用 PDF 导出（依赖桌面浏览器打印对话框），提示改用 HTML 导出。

**验证边界**：内联通道在真实浏览器里验证过（deck 经 postMessage 渲染、goto 跳页、
grid 尺寸正确）；但**未在真机 Obsidian 上验证**，capacitor 资源 URL 与手机内存表现待实测。

**发布打包（第五轮追加）**：**只有一个包**，桌面端与移动端共用同一份产物。
踩到的关键点：Obsidian 的安装器（社区列表、BRAT）只下载
`main.js` / `manifest.json` / `styles.css`，**不会带上插件目录里的任何额外文件夹**。
资源若留在 `dist/assets/`，用户装完得到的是渲染不出东西的空壳（只有手动解压 zip 才能用）。
故 esbuild 加了虚拟模块 `rfo:assets`，把 reveal 运行时与样式内联进 `main.js`（约 5 MB），
预览服务器改为从内存供 `/assets/*`，内联预览与 HTML 导出也直接用内存里的副本 ——
不再依赖磁盘上的资源目录。已验证：删掉 `dist/assets/` 后冒烟测试全绿。

CI（`.github/workflows/ci.yml`）在 ubuntu / macos / windows 三个平台跑
lint + 测试 + 构建 + 冒烟；冒烟会起真实服务器打一遍 `/assets`、`/vault`、SSE 路由 ——
Windows 的盘符问题正是靠这条路才能在 CI 里挡住。
发布（`release.yml`）由 tag 触发，校验 tag 与 manifest 版本一致后建草稿 release。

**`.element:` / `.slide:` 也栽在同一个坑上（第五轮追加）**：Obsidian 删注释，
这两个语法的处理器一直在渲染后找注释节点 —— 永远找不到，**静默失效**
（用户报「调 font-size 没反应」才暴露）。改为与 grid 同样的思路：
渲染前把注释换成文本标记 `⟦RFO-EL-n⟧`，渲染后按标记回填属性再抹掉标记。
注释节点的老路径保留，兼容会透传注释的宿主。
回归测试放在 `obsidianRenderer.test.ts`（渲染桩会删注释）。

**文档合并（第五轮追加）**：`docs/` 整个去掉，全部并入 README。
`docs/tutorial.md` 与 README 的七步教程完全重复，且停留在 `dimension`/`position`
的老写法（会误导读者）；写作规范并为 README 的「写作规范」一节。
Task 5.3 原计划的 `docs/tutorial.md` 因此作废——单一入口比分散文件更容易保持同步。

**仍未实现 / 已知限制**:
- `reveal.bundle.mjs` 约 4.9 MB（mermaid + Chart.js），独立导出的单文件 HTML 会一并内联。
  改成按需动态 import 可显著瘦身，但会拆出额外 chunk，与「单文件离线播放」冲突，故维持现状。
- Obsidian 内嵌块（`![[note#heading]]`）的渲染时序依赖 `MarkdownRenderer` 的异步加载行为，需在真实 Obsidian 内复核。
- 嵌套层数上限 8 层（`gridParser` / `splitParser` 的 `MAX_NESTING`），超出部分保持原文。

---

## 十五、代码块与内联通道修正（2026-08-13，第六轮）

### 1. 代码块里的语法被当成标记执行

写一页「教语法」的幻灯片，示例会被**当真执行**。分页器一开始就用
`findCodeRanges` 跳过代码范围，渲染前的五个抽取器却都没有：

| 语法 | 后果 |
|------|------|
| `<grid>` / `<split>` | 示例消失，一个绝对定位的真 grid 被塞进 `<pre>` |
| `<!-- .element: -->` | 示例变成标记，属性套到了代码块上 |
| `<style>` | 示例被从正文挖走只剩空行，**示例 CSS 真的套到整个 deck 上** |
| `note:` | YAML 示例从中间截断，后半段连同收尾的 ``` 一起搬进演讲备注 |

`findCodeRanges` 挪到 `src/utils/codeRanges.ts`，旁边加 `replaceOutsideCode`
（匹配**起点**落在代码里就原样保留），五个抽取器统一走它，分页器行为不变。
该文件同样**不得 import Node 内置模块**（移动端要加载）。
嵌套解析的每一轮都要重算范围 —— 上一轮已经改写过文本。

### 2. 内联通道的图片全裂（影响面最大）

`serverBase` 在服务器没跑时**编了一个占位地址**（`127.0.0.1:{设置的端口}`），
于是管线把每张 `app://` 图片都改写到一个没人监听的端口上。
而内联通道靠的正是「blob 页面与宿主同源、`app://` 能直接加载」——
**移动端永远走内联，桌面端服务器起不来时也走它**，结果就是整页图片全裂。
`processImages` 本来就支持 `serverBase` 缺省（连单测都有），只有这个 getter 在撒谎。

- getter 改为返回 `undefined`；启动失败不再把「没在跑的 server」赋给 `this.server`；
- 服务器起 / 停都要重跑管线（新增 `switchPreviewChannel`），否则 URL 停留在上一个通道；
  卸载走 `shutdownServer`，不做这些无谓的事。
- Excalidraw 同名 png 替换此前也被 `serverBase` 挡着，内联模式下静默不生效，现保持 `app://` 形态。
- HTML 导出原本正是靠那个占位地址找资源的，故 `collectVaultAssetRefs` 补上 `app://` 形态
  （顺带剥掉 `?mtime`），否则服务器没起时导出的 HTML 会带着 `app://` 链接，换台机器全裂。

### 3. 顺带修掉的

| 问题 | 说明 |
|------|------|
| 刷新预览在内联模式下是死的 | `reloadPreview` 见服务器没跑就以 Notice 告退 —— 手机上工具栏按钮和 `Mod+Shift+R` 永远无效，关掉自动刷新后就再也更新不了预览 |
| HTML 导出在移动端未捕获地 reject | 模块顶层 `import fs`，动态 import 一求值就抛；且 PDF 导出还在指路「改用 HTML 导出」。现两处都明确只支持桌面端 |
| 首次渲染失败就再也收不到 SSE | `connectEvents` 挂在首渲染的 `then` 上；一次 `/deck` 失败后连「刷新预览」都救不回来（它正是靠这条流广播的），只能关掉面板重开。改为先连再渲染 |
| Chart.js 实例泄漏 | 每次重渲染 `innerHTML` 重建，canvas 是新节点所以不报错，但旧实例连同 resize 监听一直活着；开着自动刷新时每次防抖编辑攒一批。现在重新实例化前先 `destroy()` |
| 长代码自适应对垂直子页不生效 | reveal 给还没进视距的垂直子页 `display:none`，量出来 0×0，而 `0 <= 0` 会被判成「装得下」直接跳过。横向页只是 `opacity:0`、仍有布局，首次就量得准 —— 所以只有栈里靠后的页中招。改为 `slidechanged` 时补测当前页 |

**验证**：230 项单测（新增 `codeRanges` / `codeFence` 共 22 项，及 app:// 资源、
无 serverBase 的 Excalidraw 回归）、lint、三平台构建与冒烟；
iframe 运行时的三条改动在真实浏览器里对着真服务器逐条验过
（垂直栈第 3 页从「不缩」变为 10px + `scale(0.56)`；SSE 连续推 9 版 deck 页面都跟上；
图表在多轮重渲染后仍正常）。冒烟桩补了 `getActiveFile`：起服务器现在会重跑管线。

**移动端仍无导出**：PDF 依赖桌面浏览器打印对话框，HTML 导出依赖 `fs`。
真要支持得改用 `vault.adapter` 读写，且资源定位不能再依赖「预览改写后的 URL」
（内联模式下压根没有 `/vault` 链接），属于功能开发而非修 bug，未动。

---

*规划版本: v3.3 (reveal.js 6.x, AI-oriented, 真实笔记实测修正)*  
*最后更新: 2026-08-13*
