# 幻灯片写作规范

给用 `reveal-for-obsidian` 做课件、汇报的人。目标是让一套笔记**改一处、全局跟着变**，
而不是每页都在调数字。

---

## 一、核心规范：三层职责，各管各的

这是本规范里最重要的一条。样式写在哪里，取决于它管的是什么：

| 层 | 写在哪 | 管什么 | 例子 |
|----|--------|--------|------|
| **位置层** | `<grid>` 的 `dim` / `pos` | 这块内容在画布的哪、多大 | `dim="76 24" pos="12 30"` |
| **外观层** | `<grid>` 的 `style` | 这一块的容器外观 | `background`、`border-radius`、`padding` |
| **排版层** | `<style>` 里的 class | 字号、行距、对齐、间距 | `.cover h1 { font-size: 2.5rem }` |

**判断标准**：这条样式在别的页面还会用到吗？
会 → 写进 `<style>` 的 class；只此一处 → 写在 grid 的 `style`。

> `<!-- .element: -->` 不在这三层里。它是 reveal 的传统语法，本插件为兼容而支持，
> 但它让正文变脏、无法复用、每处都要单独改。**默认不要用**，
> 只在「某一个元素必须特事特办、且加 class 反而更绕」时才用。

---

## 二、文件骨架

每篇课件都按这个顺序写：

````markdown
---
title: 单片机原理与应用
size: 16:9
margin: 0.01
---

<style>
/* 1. 设计变量：颜色、间距，全篇只在这里定义 */
:root {
  --brand: #B81C22;
  --brand-soft: rgba(184, 28, 34, .08);
  --muted: #6B6B6B;
}

/* 2. 全局基调 */
.reveal .grid { line-height: 1.55; }
.reveal .grid img { max-height: 100%; width: auto; object-fit: contain; }

/* 3. 版式 class：封面、章节页、正文页…… */
.cover { text-align: center; }
.cover h1 { font-size: 2.5rem; margin: 0; font-weight: 600; line-height: 1.25; }
.cover p  { font-size: .9rem; margin: .4em 0 0; opacity: .85; }

.bar  { font-size: .7rem; font-weight: 600; }
.foot { font-size: .5rem; color: var(--brand); text-align: center; }
</style>

# 第一页

---

# 第二页
````

`<style>` 块会被提取成文档级 CSS，不会出现在正文里，放哪一页都行——**统一放开头**。

跨笔记复用就把这段 CSS 存成 vault 里的 `.css` 文件，在设置的 Local CSS files 填路径，
或在 frontmatter 写 `css: [themes/course.css]`。

---

## 三、单位规范

| 用途 | 单位 | 理由 |
|------|------|------|
| grid 的位置和尺寸 | 画布百分比（`dim` / `pos` 的默认单位） | 画布等比缩放，任何屏幕都成立 |
| **字号** | `rem` | 相对根字号，**不受嵌套影响** |
| 跟随字号的间距（`margin` / `padding` / `gap`） | `em` | 字号一改，间距按比例跟上 |
| 描边、圆角、发丝线 | `px` | 本来就该是固定值 |

**根字号 = 画布宽度 ÷ 1920 × 40px**。16:9 画布下 `1rem = 40px`，换成 4:3 会自动变小，
所以用 `rem` 写的字号在改画布比例后仍然协调。

### 为什么字号别用 `em`

`em` 在 `font-size` 上参照的是**父元素**，嵌套时会连乘：

```css
.reveal .grid { font-size: .62em; }   /* grid 套 grid 时 → .62 × .62 = .38em，越套越小 */
```

要么改用 `rem`，要么加一行防护：

```css
.reveal .grid .grid { font-size: 1em; }
```

---

## 四、命名约定

- class 用**语义名**，不用外观名：`.cover`、`.section-title`、`.footnote`，
  而不是 `.big-red`、`.font24`。改设计时不用改名字。
- 颜色一律走变量：`var(--brand)`，不要在页面里散落 `#B81C22`。
- 一个 class 只管一类版式；需要组合时叠加：`class="cover dark"`。

---

## 五、版式模板

直接复制改用。配套的 class 见上面的 `<style>` 骨架。

### 封面页

```markdown
<grid dim="22 12" pos="6 7">
![[校徽.png]]
</grid>

<grid dim="76 24" pos="12 30" class="cover" style="background: var(--brand); color: #fff; border-radius: 16px; padding: 0 48px;">

# 第1章 如何学习单片机

《单片机原理与应用》

</grid>

<grid dim="80 10" pos="10 60" class="cover" style="color: var(--muted);">
合肥大学人工智能与大数据学院 · 张建武
</grid>
```

### 标准内容页（标题条 + 双栏 + 页脚）

```markdown
<grid dim="100 12" pos="top" class="bar" style="background: var(--brand); color: #fff; border-radius: 15px; align-items: flex-start; text-align: left; padding: 0 3%;">
## 课程概述
</grid>

<grid dim="43 66" pos="6 16">
### 今天的核心问题

- 单片机是什么？
- 为什么要学它？
</grid>

<grid dim="43 66" pos="51 16">
### 本课大纲

- 答疑解惑
- 实战演示
</grid>

<grid dim="100 11" pos="0 85" class="foot" style="background: var(--brand-soft); border-radius: 15px;">
2026年秋《单片机原理与应用》
</grid>
```

### 图文页

```markdown
<grid dim="45 60" pos="5 25">
![[原理图.png]]
</grid>

<grid dim="45 60" pos="52 25">
- 要点一
- 要点二
</grid>
```

### 分栏（栏宽自动平分时更省事）

```markdown
<grid dim="88 60" pos="center">
<split even gap="2">

左栏

右栏

</split>
</grid>
```

---

## 六、反模式

| 别这么写 | 为什么 | 改成 |
|---------|--------|------|
| `style="align-items: center"` | `.grid` 默认就是居中，纯属重复 | 删掉；要左对齐才写 `align-items: flex-start; text-align: left` |
| 每页都写一遍相同的 `style` | 改设计要改几十处 | 抽成 class |
| 正文里堆 `<!-- .element: -->` | 正文变脏、不可复用 | 用 class |
| `font-size` 用 `em` | 嵌套连乘 | 用 `rem` |
| 页面里散落 `#B81C22` | 改配色要全文替换 | `var(--brand)` |
| 靠反复试数字对齐 | 慢 | 开辅助线照着 10% 标尺调 |

---

## 七、交付前检查清单

1. **开辅助线**（面板标题栏的网格按钮）：看每块的边框和 `宽×高 @ left top`，确认没有越界、没有意外重叠。
2. **把预览面板拖窄**：一切等比缩放，小面板里看着费劲的字，投到大屏上同样费劲。
3. **确认画布比例**与投影设备一致（`size: 16:9` / `4:3`）；不一致不会裁切，但会留黑边。
4. **按 `S`** 过一遍演讲者视图，确认备注都在该在的页上。
5. **导出 HTML** 试放一次，确认图片都跟着打包了（导出目录的 `files/`）。

---

## 八、速查

| 需求 | 写法 |
|------|------|
| 放到画布某处 | `<grid dim="宽 高" pos="左 上">` |
| 贴边 / 居中 | `pos="topleft"` / `top` / `center` / `bottomright` |
| 距右下留白 | `pos="-6 -8"`（负数 = 距右/下边缘） |
| 逐步显示 | `frag="1"` |
| 图形裁切 | `shape="hexagon"` |
| 分栏 | `<split even gap="2">`，栏间空行分隔 |
| 演讲备注 | 页面末尾 `note:` 起，到本页结束 |
| 指定图片宽度 | `![[图.png\|800]]` |
| 整页背景 | `<!-- .slide: background-color="#101010" -->` |
