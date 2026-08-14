# reveal-for-obsidian

把 Obsidian 笔记变成 [reveal.js](https://revealjs.com/) 6.x 演示文稿。用纯 Markdown 写作，`---` 分页，用 `<grid>` 精确定位 + `style` 直接写 CSS 搭建版面——**不内置任何主题**，幻灯片长什么样完全由你控制。

---

## 目录

- [功能一览](#功能一览)
- [平台支持](#平台支持)
- [安装](#安装)
- [快速上手](#快速上手)
- [完整教程：从空笔记到一份课件](#完整教程从空笔记到一份课件)
- [写作规范](docs/authoring-guide.md)
- [命令与快捷键](#命令与快捷键)
- [分页语法](#分页语法)
- [Frontmatter 配置](#frontmatter-配置)
- [Grid 定位系统（核心）](#grid-定位系统核心)
- [Split 分栏](#split-分栏)
- [演讲者备注](#演讲者备注)
- [元素与页面注释](#元素与页面注释)
- [图片、视频与 Excalidraw](#图片视频与-excalidraw)
- [富内容：SVG / Mermaid / Chart.js / 公式](#富内容svg--mermaid--chartjs--公式)
- [Emoji 与 Font Awesome](#emoji-与-font-awesome)
- [自定义样式与 CSS 变量](#自定义样式与-css-变量)
- [导出 PDF / HTML](#导出-pdf--html)
- [版面辅助线（调版面利器）](#版面辅助线调版面利器)
- [设置项说明](#设置项说明)
- [常见问题（排障）](#常见问题排障)
- [VSCode 扩展（规划中）](#vscode-扩展规划中)
- [本地开发](#本地开发)
- [架构简介](#架构简介)

---

## 功能一览

- **Markdown → 幻灯片**：`---` 水平分页，`xxx` 垂直分页，也支持按标题级别自动分页
- **`<grid>` 绝对定位**：百分比坐标、方位关键字、负偏移（距右/下边缘），把任何内容放到画布任何位置
- **`<split>` 分栏**：一行标签搞定 flexbox 多栏布局
- **动画**：reveal.js fragment 渐显、animate.css 风格入场动画、12 种内置图形裁切（shape）
- **演讲者备注**：`note:` 逐页备注，按 `S` 打开演讲者视图
- **Obsidian 原生语法**：wikilink 图片（`![[img.png|800]]`）、视频、Callout、脚注、Excalidraw
- **富内容**：Mermaid 图表、Chart.js 图表、代码高亮、数学公式、Emoji 短代码、Font Awesome
- **实时预览**：停止输入 300ms 后自动刷新，切换笔记自动跟随
- **导出**：PDF（打印视图）与可离线播放的单文件 HTML
- **安全设计**：预览运行在隔离 iframe 中，由仅监听 `127.0.0.1` 的本地服务器承载

## 平台支持

| 平台 | 预览 | 图片/视频 | HTML 导出 | PDF 导出 |
|------|------|-----------|-----------|----------|
| macOS / Windows / Linux | 本地服务器 | ✅ | ✅ | ✅ |
| iOS / Android | 内联渲染 | ✅ | ✅ | ❌ 用 HTML 导出代替 |

**桌面端**走本地 HTTP 服务器（仅监听 `127.0.0.1`），支持增量刷新，路径处理已按
Windows 的盘符与反斜杠适配（`C:\Users\...` 与 URL 里的 `/C:/Users/...` 互转）。

**移动端**没有 Node，起不了服务器，改走**内联渲染**：把 reveal 运行时和样式内联成一个
页面，用 `blob:` URL 挂到 iframe 上，幻灯片数据由插件 `postMessage` 推送，编辑时只发
数据、不重建页面。blob 与宿主同源，所以 Obsidian 的图片资源照常加载。

移动端的两点取舍：
- **PDF 导出不可用**（依赖桌面浏览器的打印对话框），请用 HTML 导出。
- 内联页面把整个 reveal 运行时（含 Mermaid、Chart.js，约 5 MB）打进一个 blob，
  首次打开预览会有一两秒加载；之后编辑刷新不受影响。

桌面端若端口全被占用导致服务器起不来，预览会自动退到同一套内联渲染，不至于开天窗。


## 安装

> **一个包通吃**：桌面端与移动端共用同一份构建产物，不区分平台。
> iframe 需要的 reveal 运行时与样式在构建期就内联进了 `main.js`
> （Obsidian 的安装器只下载 `main.js` / `manifest.json` / `styles.css` 三个文件，
> 不会带上任何额外目录），所以这三个文件就是完整插件，代价是 `main.js` 约 5 MB。

### 手动安装（当前方式）

1. 在本仓库执行 `npm install && npm run build`（或下载 Release 产物）。
2. 把 `dist/` 目录下的 **`main.js`、`styles.css`、`manifest.json` 和整个 `assets/` 文件夹**复制到：
   `<你的库>/.obsidian/plugins/reveal-for-obsidian/`
3. 重启 Obsidian（或执行命令 `Reload app without saving`），在 **设置 → 第三方插件** 中启用 `reveal-for-obsidian`。

> `assets/` 文件夹必须一起复制——它里面是打包好的 reveal.js 运行时，缺失会导致预览空白。

### BRAT（尝鲜渠道）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 社区插件。
2. BRAT 设置中选择 **Add Beta plugin**，填入本仓库地址。
3. 在 **设置 → 第三方插件** 中启用。

## 快速上手

1. 新建一篇笔记，写入：

   ````markdown
   ---
   title: 我的第一场演示
   transition: fade
   ---

   # 你好

   这是第一页

   ---

   # 第二页

   - 要点 A
   - 要点 B

   <grid dim="30 20" pos="bottomright" style="background: #e74c3c; color: white;">
   右下角红块
   </grid>
   ````

2. 按 `Ctrl/Cmd + Shift + E`（或命令面板执行 **Show Slide Preview**）。
3. 笔记右侧出现 **Slide Preview** 面板，显示渲染后的幻灯片，方向键翻页。
   光标在源码里移到哪一页，预览就自动翻到哪一页（可在设置里关掉）。
   （想要独立窗口或放回侧边栏，见 [设置项说明](#设置项说明) 的 Preview location。）
4. 继续编辑笔记，预览会在停笔 300ms 后自动更新。

> 第一次使用如果没反应，看这里：[常见问题（排障）](#常见问题排障)。

## 完整教程：从空笔记到一份课件

> 教程带你跑通一遍；成篇成套地做课件，再看 **[写作规范](docs/authoring-guide.md)**
> ——样式该写在哪一层、单位怎么选、版式模板、反模式与交付检查清单。

这一节按真实备课流程走一遍，做出一套「封面 + 标题条 + 双栏内容 + 页脚」的课件。
每一步都可以直接复制进笔记，边写边看右侧预览。

### 第 1 步：先把画布和分页定下来

新建笔记，开头写 frontmatter，然后用 `---` 分页：

````markdown
---
title: 单片机原理与应用
size: 16:9
margin: 0.01
---

# 第 1 章 如何学习单片机

---

# 第二页
````

- `size` 决定画布比例（`16:9` / `4:3` / `21:9`，也可以写 `1920x1080`）。
  frontmatter 里的 `16:9` 会被 YAML 当成时间解析，插件已经做了还原，照写即可。
- `margin` 是画布四周留白（0~1），做满版设计就调小。
- 想按标题自动分页，设置里填 Heading divider（比如 `1,2`），就不用手写 `---` 了。

按 `Ctrl/Cmd + Shift + E` 打开预览，此时应该已经能翻页了。

### 第 2 步：用 `<grid>` 摆版面

本插件**不内置主题**，版面全靠 `<grid>` 定位 + `style` 写 CSS。一个 grid 就是画布上的一个矩形框：

````markdown
<grid dim="76 24" pos="12 30" style="background: #B81C22; color: #fff; border-radius: 16px;">

# 第 1 章 如何学习单片机

《单片机原理与应用》

</grid>
````

- `dim="76 24"`：宽 76%、高 24%（相对画布）。
- `pos="12 30"`：左边距 12%、上边距 30%。**数值定位对齐的是左上角**。
- 里面照常写 Markdown，标题、列表、图片都会正常渲染。

关键字定位更省事，而且对齐的是对应的边或角：

````markdown
<grid dim="100 12" pos="top" style="background: #B81C22; color: #fff;">
## 课程概述
</grid>

<grid dim="40 7" pos="-6 -8" style="text-align: right; color: #B81C22;">
厚德、博学、善思、致用
</grid>
````

`pos="top"` 是顶边居中，`pos="-6 -8"` 是**距右边 6%、距下边 8%**（右下角对齐）。
写 `bottomright` 就是严丝合缝贴右下角。

> 三种拼法等价，混用也没问题：`dim`/`pos`（推荐）、`dimension`/`position`、
> `drag`/`drop`（advanced-slides 写法，老笔记直接能用）。

### 第 3 步：一屏放两栏

两种做法，看你要不要精确控制位置：

**A. 两个 grid 各占一半**（位置完全可控）

````markdown
<grid dim="43 66" pos="6 16">
### 今天的核心问题

- Q1 单片机是什么？
- Q2 为什么要学它？
</grid>

<grid dim="43 66" pos="51 16">
### 本课大纲

- 答疑解惑
- 实战演示
</grid>
````

**B. 一个 grid 里塞 `<split>`**（栏宽自动平分，内容多时更省心）

````markdown
<grid dim="88 60" pos="center">
<split even gap="2">

左栏内容

右栏内容

</split>
</grid>
````

`<split>` 用**空行**分栏；`even` 等宽，`gap` 是栏间距（em），
也可以用 `left="2" right="1"` 控制权重。grid 和 split 都能嵌套。

### 第 4 步：插图、备注、逐步显示

````markdown
<grid dim="45 60" pos="5 25">
![[原理图.png|800]]
</grid>

<grid dim="45 60" pos="52 25" frag="1">
这段会在按一次方向键之后才出现
</grid>

note:
这里是讲稿，只有演讲者视图（按 S）能看到，可以写多行 Markdown。
````

- `![[图片.png|800]]` 指定宽度，`|800x600` 指定宽高。
- `frag="1"` 让这个 grid 变成 reveal.js 的 fragment，数字是出现顺序。
- `note:` 之后到本页结束都算演讲者备注。**注意它是按页生效的**，写在哪一页就属于哪一页。

### 第 5 步：抽出配色，别在每个 grid 里重复写

在笔记任意位置放一个 `<style>` 块，它会被提取成文档级 CSS（不会出现在正文里）：

````markdown
<style>
:root {
  --brand: #B81C22;
  --muted: #6B6B6B;
}
/* 统一所有 grid 的正文字号 */
.reveal .grid { font-size: 0.62em; line-height: 1.55; }
/* 图片不撑破所在网格 */
.reveal .grid img { max-height: 100%; width: auto; object-fit: contain; }
</style>

<grid dim="60 20" pos="center" style="background: var(--brand); color: #fff;">
用变量的块
</grid>
````

要跨笔记复用，就把 CSS 存成 vault 里的 `.css` 文件，在设置的 **Local CSS files** 里填路径
（或 frontmatter 写 `css: [themes/course.css]`）。

### 第 6 步：对不齐的时候打开辅助线

点 Slide Preview 面板标题栏的**网格按钮**（或命令面板执行 **Toggle Grid Guides**）：画布上会铺一层 10% 的标尺，
每个 grid 画出虚线边框，左上角标出它的「宽×高 @ left top」。
照着标尺调 `dim` / `pos`，比反复试数字快得多。调完再执行一次关掉。

### 光标跟随

写长篇课件时，源码里光标移到第几页，预览就自动翻到第几页——不用手动翻页找位置。
它按**源码行号**定位，`<style>` 块和 frontmatter 占的行数都算进去了，所以不会错位。
不需要就在设置 → Preview → Follow cursor 关掉。

### 第 7 步：讲课与交付

- 放映：预览面板里按 `F` 全屏，`S` 打开演讲者视图（看备注和计时），`Esc` 总览所有页。
- 发学生：**Export Slides as HTML**，导出单文件 HTML，图片一并打包，脱离 Obsidian 也能放。
- 要 PDF：**Export Slides as PDF**，打开打印视图后在浏览器里「打印 → 另存为 PDF」。

预览面板标题栏有四个按钮，从左到右：**刷新**、**辅助线开关**、**导出 PDF**、**导出 HTML**，
不必去命令面板。右上角的「⋯」菜单里也有同样的导出项。

### 常见的坑

| 现象 | 原因 |
|------|------|
| grid 里的内容跑到页面外 | `pos` 用关键字/负数时对齐的是元素的边或角，用数值时对齐左上角，两者别记混 |
| 代码块里的 `---` 把页面切开了 | 不会：分页前会先标记代码块范围并跳过。若真被切开，检查是不是缩进代码块没写围栏 |
| 图片太大撑破 grid | 加一条 `.reveal .grid img { max-height: 100%; width: auto; }` |
| 改了设置没反应 | 端口类改动要重启服务器（改完点输入框外面会自动重启）；其余改完会立即重渲染 |


## 命令与快捷键

| 命令 | 快捷键 | 作用 |
|------|--------|------|
| Show Slide Preview | `Ctrl/Cmd + Shift + E` | 打开/聚焦预览面板 |
| Reload Slide Preview | `Ctrl/Cmd + Shift + R` | 强制重跑管线并刷新，标题栏也有按钮 |
| Start Slide Preview Server | — | 手动启动本地预览服务器 |
| Stop Slide Preview Server | — | 停止服务器 |
| Toggle Grid Guides | — | 开关版面辅助线（grid 边框 + 10% 标尺），标题栏也有按钮 |
| Export Slides as PDF | — | 打开打印视图（浏览器中 打印 → 另存为 PDF），标题栏与「⋯」菜单也有 |
| Export Slides as HTML | — | 导出单文件离线 HTML 到导出目录，标题栏与「⋯」菜单也有 |

## 分页语法

| 语法 | 效果 |
|------|------|
| `---`（独占一行） | 水平分页（下一张） |
| `xxx`（独占一行） | 垂直分页（向下叠放，方向键 ↓ 进入） |
| Frontmatter `headingDivider: [1, 2]` | 按标题级别自动分页 |

- 分隔符写成代码块（```` ``` ````）或行内代码里的内容**不会**触发分页。
- 设置页里的分隔符既可以填**纯文本标记**（如 `---`、`xxx`，按整行匹配），也可以填**正则表达式**（如 `\r?\n--\r?\n`）。
- 连续分隔符产生的空白页会被自动过滤。

```markdown
# 第一页

---

# 第二页

xxx

# 第二页的垂直子页
```

## Frontmatter 配置

笔记顶部的 YAML frontmatter 可以覆盖插件设置（仅对本篇笔记生效）：

```yaml
---
title: 产品发布会          # 演示标题（导出 HTML 的文件名/标题）
size: 16:9                 # 画布：16:9 / 4:3 / 21:9 / 1920x1080
margin: 0.04               # 页面边距（0~1）
transition: slide          # none/fade/slide/convex/concave/zoom
transitionSpeed: default   # default/fast/slow
controls: true             # 右下角导航箭头
progress: true             # 底部进度条
slideNumber: true          # 页码（true/false/'c/t'）
center: true               # 内容垂直居中
bg: '#1e1e2e'              # 全局背景（颜色或图片 URL）
css: [styles/custom.css]   # 追加 vault 内 CSS 文件
remoteCSS: [https://...]   # 追加远程 CSS
separator: '\r?\n---\r?\n' # 自定义水平分页符
verticalSeparator: xxx     # 自定义垂直分页符
headingDivider: [1, 2]     # 按 1、2 级标题自动分页
notesSeparator: 'note:'    # 自定义备注起始标记
enableOverview: true       # Esc 总览模式
scrollActivationWidth:     # 留空=禁用滚动视图自动切换
---
```

> `size: 16:9` 这类「数字:数字」写法会被 YAML 1.1 解析成六十进制数，插件已自动还原，直接写即可。

## Grid 定位系统（核心）

`<grid>` 是本插件的版面基础：一个**绝对定位**的容器，把内容精确放到画布上。

```markdown
<grid dim="60 30" pos="20 25" style="background: #e74c3c;">
这里的 Markdown 会正常渲染：**加粗**、列表、图片都可以
</grid>
```

### 属性一览

| 属性 | 说明 | 示例 |
|------|------|------|
| `dim` | 尺寸「宽 高」，画布百分比 | `dim="60 30"` |
| `pos` | 位置「左 上」，写法见下表 | `pos="20 25"` |
| `style` | 内联 CSS，原样透传（可用 CSS 变量） | `style="background: var(--brand);"` |
| `class` | 追加 HTML class | `class="card shadow"` |
| `shape` | 图形裁切（12 种内置） | `shape="hexagon"` |
| `frag` | reveal.js fragment（数字=顺序，或动画名） | `frag="1"` / `frag="fade-up"` |
| `animate` | 入场动画类（animate.css 命名） | `animate="fade-in"` |

> **单位一律是画布百分比。** reveal.js 会把整块画布（默认 1920×1080）等比缩放到窗口，
> 所以百分比布局在笔记本、投影仪、4K 大屏上表现一致，不需要也不提供绝对像素定位。
>
> **别名**：`dim` / `pos` 也可以写成完整的 `dimension` / `position`，
> 或 advanced-slides 的 `drag` / `drop` —— 三种拼法语义完全相同，可以混用，
> 已有的 advanced-slides 笔记不用改就能渲染。同一标签写了多种时以短写优先。

### pos 写法

| 写法 | 含义 |
|------|------|
| `pos="20 25"` | left 20%、top 25% |
| `pos="top"` | 顶部居中（另一轴自动居中） |
| `pos="left"` / `right` / `bottom` / `center` | 同理 |
| `pos="topleft"` / `topright` / `bottomleft` / `bottomright` | 四个角 |
| `pos="left top"` | 两个关键字组合 |
| `pos="-6 -8"` | **负数 = 距右/下边缘**（生成 `calc(100% - 6%)`） |

> **定位锚点**：数值写法（`20 25`）对齐的是元素**左上角**；关键字与负数写法对齐的是元素对应的边或角
> —— `center` 是元素中心落在画布中心，`bottomright` 是元素右下角贴画布右下角，`-6 -8` 是元素右下角距右/下边缘 6%/8%。

### shape 内置图形

`circle` `ellipse` `triangle` `triangle-down` `diamond` `hexagon` `pentagon` `star` `arrow` `chevron` `parallelogram` `ribbon`

```markdown
<grid dim="20 20" pos="topright" shape="hexagon" style="background: #f1c40f;">
</grid>
```

> shape 表外的值会原样透传为 `clip-path`，可以写任意 CSS 裁切函数。

### 嵌套

`<grid>` 可以嵌套：内层 grid 的百分比是**相对外层 grid**算的，适合先划分区域再在区域内排版。
`<split>` 同样可以嵌套，也可以放进 `<grid>` 里。

```markdown
<grid dim="90 60" pos="center" style="background: #f8fafc;">
<grid dim="45 80" pos="left" style="background: #2563eb; color: #fff;">左半</grid>
<grid dim="45 80" pos="right" style="background: #e11d48; color: #fff;">右半</grid>
</grid>
```

### 属性自动补全

在笔记里输入 `<grid ` 或 `<split ` 会弹出属性名候选；`position="` / `shape="` / `frag="` / `animate="`
还会提示可用取值。不需要可在设置 → Preview → Autocomplete 关掉。

### 完整示例：封面页

```markdown
<grid dim="80 20" pos="top" style="text-align: center;">
# 产品发布会
</grid>

<grid dim="30 40" pos="10 40" style="background: #3498db; color: #fff; border-radius: 12px; padding: 1em;">
左侧卡片
</grid>

<grid dim="30 40" pos="-10 40" shape="parallelogram" style="background: #e67e22;">
右侧图形块
</grid>
```

## Split 分栏

`<split>` 用于快速多栏布局，栏与栏之间用**空行**分隔：

```markdown
<split even gap="2">

左栏内容

右栏内容

</split>
```

| 属性 | 说明 |
|------|------|
| `even` | 各栏等宽 |
| `left` / `right` | 双栏宽度权重（如 `left="2" right="1"` → 2:1） |
| `gap` | 栏间距（em） |
| `wrap` | 允许换行 |
| `no-margin` | 去掉栏内首个元素的上边距 |

## 演讲者备注

每页末尾以 `note:`（可在设置/frontmatter 改）起头的部分是演讲者备注，不进幻灯片正文：

```markdown
# 某一页

note:
这里写提词内容，
可以是多行 Markdown。
```

放映时按 `S` 打开演讲者视图（含备注与计时器）。

## 元素与页面注释

```markdown
这段文字会变红。
<!-- .element: style="color: red;" -->

<!-- .slide: background-color="#2d2d2d" -->
```

- `<!-- .element: ... -->`：作用于**紧邻的上一个元素**，支持 `class="..."`、`style="..."` 及任意 `key="value"` 属性。
- `<!-- .slide: ... -->`：作用于**当前页**，背景相关键（`background-color`、`background-image`、`background-size` 等）会自动映射为 reveal.js 的 `data-background-*`。

## 图片、视频与 Excalidraw

| 语法 | 效果 |
|------|------|
| `![[photo.png]]` | Vault 内图片（经本地服务器加载） |
| `![[photo.png|800]]` / `![[photo.png|800x600]]` | 指定宽 / 宽×高 |
| `![alt](https://...)` | 远程图片，原样保留 |
| `![[clip.mp4]]` | 视频（mp4/webm/ogv/mov/m4v）自动包装为带控件的 `<video>` |
| `![[sketch.excalidraw]]` | 存在同名 `.png` 时引用该图；否则保留链接（完整渲染需 Excalidraw 插件导出） |

## 富内容：SVG / Mermaid / Chart.js / 公式

### SVG 代码块

````
```svg
<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#e74c3c"/></svg>
```
````

内容含 `<svg` 时渲染为图片，否则保持代码块。

### Mermaid

````
```mermaid
graph LR
  A[需求] --> B[设计] --> C[上线]
```
````

本地打包的 Mermaid 10 渲染，离线可用。

### Chart.js

````
```chart
type: bar
labels: [Q1, Q2, Q3, Q4]
series:
  - title: 营收
    data: [12, 19, 7, 15]
```
````

`type` 支持 Chart.js 全部图表类型（bar/line/pie/doughnut/radar…），`series[].title/data` 映射为数据集，额外 `options` 原样透传。

### 数学公式

`$...$` 行内公式与 `$$...$$` 块级公式由 Obsidian 渲染器直接渲染（MathJax），另有 reveal.js math 插件兜底。

## Emoji 与 Font Awesome

- Emoji 短代码：`:smile:` → 😄、`:rocket:` → 🚀、`:warning:` → ⚠️（内置约 60 个常用映射，代码块内不替换）
- Font Awesome：`:fas_rocket:` → `<i class="fa-solid fa-rocket">`、`:fab_github:` → `<i class="fa-brands fa-github">`
  - FA 图标需要样式表才能显示：在 frontmatter 加 `remoteCSS: [https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css]`

## 自定义样式与 CSS 变量

笔记中的 `<style>` 块会被提取为**文档级 CSS**，不进正文，可定义变量供 grid 引用：

```markdown
<style>
:root { --brand: #e74c3c; }
.big { font-size: 2em; }
</style>

<grid dim="40 20" pos="center" class="big" style="color: var(--brand);">
品牌色大字
</grid>
```

也可以用 frontmatter 的 `css`（vault 内文件）和 `remoteCSS`（远程 URL）追加样式表。

## 导出 PDF / HTML

- **Export Slides as PDF**：在系统浏览器打开 `?print-pdf` 打印视图，然后 `打印 → 另存为 PDF`（纸张方向/尺寸已由 reveal.js 按画布自动设置）。
- **Export Slides as HTML**：把 reveal 运行时、样式、deck 数据全部内联成一个 HTML 文件，本地图片复制到 `files/` 子目录并改写为相对路径。输出到设置中的导出目录（默认 `/export`），双击即可离线播放。

## 版面辅助线（调版面利器）

三种打开方式，效果一样：**面板标题栏的网格按钮**（最顺手，点亮表示开着）、
命令面板的 **Toggle Grid Guides**、设置 → Preview → Show grid guides。

- 画布上铺一层 **10% 一格的标尺**，`pos="30 40"` 该落在哪一格一目了然；
- 每个 `<grid>` 画出**红色虚线边框**，一眼看清它实际占了多大范围；
- 每个 grid 左上角标出 **`宽×高 @ left top`**，比如 `76×24% @ 12% 30%`。

辅助线只是预览时的视觉叠加，不影响导出的 PDF / HTML，也不会改变布局
（标签是绝对定位的伪元素，不会挤动内容）。


## 设置项说明

**设置 → 第三方插件 → reveal-for-obsidian**：

| 分组 | 关键项 |
|------|--------|
| Canvas | 画布比例/自定义宽高、边距、字号自动缩放与倍率 |
| Pagination | 水平/垂直分隔符（**纯文本标记或正则均可**）、标题分页级别、备注标记 |
| Transition | 翻页动画与速度 |
| Controls | 导航箭头、进度条、页码、垂直居中、Esc 总览 |
| Document | 默认标题、追加 CSS、全局背景 |
| Preview Server | 自动启动开关、端口（默认 3000，端口被占用时自动顺延；改完失焦即重启服务器） |
| Export | 导出目录 |
| Preview | 面板位置（**默认与笔记并排**，可选独立窗口 / 右侧边栏）、滚动视图阈值、自动刷新、光标跟随、`<grid>`/`<split>` 属性自动补全、版面辅助线 |

## 常见问题（排障）

**预览面板空白 / 一直显示 "Empty"？**
1. 确认预览服务器在运行：命令面板执行 `Start Slide Preview Server`，然后 `Reload Slide Preview`。
2. 确认当前打开的是 `.md` 笔记（预览跟随最近活动的 Markdown 文件）。
3. 打开 Obsidian 开发者工具（`Ctrl/Cmd + Option + I`）看 Console 里 `[reveal-for-obsidian]` 开头的错误；iframe 内的错误会以红色浮层直接显示在预览底部。

**提示端口被占用（port 3000 is in use, preview server started on 3001）**
3000 是常用端口（其他插件、开发服务器都可能占着）。插件会自动顺延到下一个可用端口（最多试 10 个），
提示里会写明实际使用的端口，预览面板与导出都会跟着走，通常无需处理。想固定端口就在设置里改 Port，
改完点开输入框外面（失焦）服务器会自动重启。

**按 S 打开演讲者视图报错 / 没反应**
演讲者视图要另开一个窗口。预览 iframe 需要 `allow-popups` 权限，插件已默认带上；
如果你用的是旧版本装出来的面板，关掉预览面板重新打开一次即可。

**幻灯片被切成很多空白页 / 分页位置不对**
检查设置里的 Vertical separator：如果填了 `xxx` 之外的值请确认写法。纯文本标记按**整行**匹配；想完全自定义可写正则（默认 `\r?\n---\r?\n`）。另外代码块里的 `---` 不会分页。

**图片不显示**
Vault 内图片经本地服务器加载，确认服务器在运行；远程图片请检查网络。导出 HTML 时本地图片会复制到 `files/` 目录，请保持两者相对位置不变。

**样式看起来"很素"**
这是设计使然：本插件不内置主题，只提供中性可读的基础样式。用 `<style>` 块 / `css` / `remoteCSS` 定义你自己的风格，grid 的 `style` 属性可以精确控制每个元素。

**Mermaid / 图表不渲染**
检查代码块语言标记是 ` ```mermaid ` / ` ```chart `；chart 内容必须是合法 YAML 且包含 `series`。单个图渲染失败会在预览底部显示错误，不影响其他页。

## VSCode 扩展（规划中）

本插件的 Markdown 处理层（`src/processors/`、`src/transformers/`、`src/types/`）按不依赖 Obsidian API 的标准设计，计划抽出共享层后提供 VSCode 扩展，在非 Obsidian 环境预览同一套幻灯片 Markdown。该扩展为可选里程碑，不影响本插件主体功能。

## 本地开发

```bash
npm install        # 安装依赖
npm run dev        # watch 模式构建（改代码自动重打包到 dist/）
npm run build      # 生产构建（含 tsc 类型检查）
npm test           # vitest 单元测试（129 个用例）
npm run lint       # eslint
node scripts/smoke-server.mjs   # 预览服务器冒烟测试（无需 Obsidian）
```

开发调试：把 `dist/` 软链到测试库的插件目录——

```bash
ln -s "$(pwd)/dist" "<测试库>/.obsidian/plugins/reveal-for-obsidian"
```

改代码后在 Obsidian 里 `Ctrl/Cmd + P` → `Reload app without saving`。

## 架构简介

```
┌─ Obsidian 插件进程 ─────────────────────────┐
│  MarkdownRenderer → 管线(17 步) → SlideDeck  │
│  本地 HTTP 服务器（仅 127.0.0.1:3000）        │
│   ├─ /reveal.html   渲染页面                 │
│   ├─ /assets/*      reveal.js 打包资源       │
│   ├─ /deck          SlideDeck JSON          │
│   ├─ /vault/*       vault 内图片/视频        │
│   └─ /events        SSE 实时刷新推送         │
└──────────────┬──────────────────────────────┘
               │ iframe（sandbox 隔离）
┌──────────────┴──────────────────────────────┐
│  reveal.bundle.mjs（reveal.js 6 + 插件 +     │
│  mermaid + chart.js）拉取 /deck 渲染放映     │
└─────────────────────────────────────────────┘
```

- 预览与 Obsidian 完全 DOM 隔离，插件 CSS 与 reveal CSS 互不污染
- reveal.js / Mermaid / Chart.js 全部本地打包，离线可用
- 详细任务规划见 [TASK_PLAN_v2.md](TASK_PLAN_v2.md)，演示示例见 [examples/demo.md](examples/demo.md)，上手教程见 [docs/tutorial.md](docs/tutorial.md)

## License

MIT
