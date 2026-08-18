---
title: Fixture Deck
size: 16:9
transition: fade
---

<style>
:root { --brand: #2563eb; }
</style>

# 标题页

副标题一行

note:
这里是演讲者备注，**支持 Markdown**。

---

<grid dim="40 30" pos="10 15" style="background: var(--brand); color: #fff;">
左上角的块
</grid>

<grid dim="30 30" pos="bottomright" shape="hexagon" frag="1" animate="fadeIn">
六边形
</grid>

<grid dim="80 20" pos="center" class="wide">
<split even gap="2">左栏

右栏</split>
</grid>

---

## 代码与分隔符

```js
// 代码块里的 --- 和 xxx 都不能触发分页
const sep = '---';
xxx
```

行内代码 `a --- b` 同理。

xxx

### 垂直子页

- 列表项 :rocket:
- 第二项

<!-- .slide: background-color="#101010" -->
