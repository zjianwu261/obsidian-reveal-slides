# 图型模板

四份可直接改的骨架。共用的 `<defs>` 见每份开头，颜色见 SKILL.md 的色板。

---

## flow —— 步骤流程 / 前后对比

适合：`++b` vs `b++`、编译烧录的四步、中断响应过程。

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 250"
     font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif">
  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
            orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#9BB4D4"/></marker>
    <style>
      .chip{fill:#EAF1FA;stroke:#064FA1;stroke-width:2;rx:12}
      .step{fill:#fff;stroke:#C9D8EC;stroke-width:2;rx:12}
      .op{font:600 30px ui-monospace,Menlo,monospace;fill:#064FA1}
      .t{font:22px sans-serif;fill:#1a1a1a}
      .m{font:20px ui-monospace,Menlo,monospace;fill:#555}
      .lead{font:600 22px sans-serif;fill:#8A2B2F}
      .arr{stroke:#9BB4D4;stroke-width:3;marker-end:url(#a)}
    </style>
  </defs>

  <rect class="chip" x="10" y="26" width="130" height="60"/>
  <text class="op" x="75" y="66" text-anchor="middle">++b</text>
  <line class="arr" x1="152" y1="56" x2="196" y2="56"/>
  <rect class="step" x="206" y="26" width="180" height="60"/>
  <text class="t" x="296" y="63" text-anchor="middle">① 先自增 +1</text>
  <line class="arr" x1="398" y1="56" x2="442" y2="56"/>
  <rect class="step" x="452" y="26" width="200" height="60"/>
  <text class="t" x="552" y="63" text-anchor="middle">② 再参与运算</text>
  <text class="lead" x="676" y="52">b = 3 时</text>
  <text class="m" x="676" y="80">c = ++b  →  c 得 4</text>

  <line x1="10" y1="118" x2="890" y2="118" stroke="#E5E5E5" stroke-width="2"/>

  <rect class="chip" x="10" y="150" width="130" height="60"/>
  <text class="op" x="75" y="190" text-anchor="middle">b++</text>
  <line class="arr" x1="152" y1="180" x2="196" y2="180"/>
  <rect class="step" x="206" y="150" width="180" height="60"/>
  <text class="t" x="296" y="187" text-anchor="middle">① 先参与运算</text>
  <line class="arr" x1="398" y1="180" x2="442" y2="180"/>
  <rect class="step" x="452" y="150" width="200" height="60"/>
  <text class="t" x="552" y="187" text-anchor="middle">② 再自增 +1</text>
  <text class="lead" x="676" y="176">b = 3 时</text>
  <text class="m" x="676" y="204">c = b++  →  c 得 3</text>
</svg>
```

**改法**：一行一条流程，`chip` 是主体、`step` 是环节、右侧留给具体例子。行距 124，多一行就整体加高 viewBox。

---

## bitfield —— 寄存器位分布

适合：TCON / TMOD / SCON / PSW，单片机课件里出现最多的图。

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 200"
     font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif">
  <defs><style>
    .cell{fill:#fff;stroke:#C9D8EC;stroke-width:2}
    .cell.hot{fill:#EAF1FA;stroke:#064FA1}
    .bit{font:600 24px ui-monospace,Menlo,monospace;fill:#1a1a1a;text-anchor:middle}
    .idx{font:18px ui-monospace,Menlo,monospace;fill:#888;text-anchor:middle}
    .reg{font:600 26px ui-monospace,Menlo,monospace;fill:#064FA1}
    .addr{font:20px ui-monospace,Menlo,monospace;fill:#555}
    .cap{font:20px sans-serif;fill:#8A2B2F}
  </style></defs>

  <text class="reg" x="10" y="42">TCON</text>
  <text class="addr" x="120" y="42">0x88 · 可位寻址</text>

  <!-- 8 个位：x = 10 + i*110，高位在左 -->
  <g>
    <rect class="cell" x="10"  y="60" width="105" height="58"/><text class="bit" x="62"  y="98">TF1</text><text class="idx" x="62"  y="140">D7</text>
    <rect class="cell" x="120" y="60" width="105" height="58"/><text class="bit" x="172" y="98">TR1</text><text class="idx" x="172" y="140">D6</text>
    <rect class="cell" x="230" y="60" width="105" height="58"/><text class="bit" x="282" y="98">TF0</text><text class="idx" x="282" y="140">D5</text>
    <rect class="cell" x="340" y="60" width="105" height="58"/><text class="bit" x="392" y="98">TR0</text><text class="idx" x="392" y="140">D4</text>
    <rect class="cell" x="450" y="60" width="105" height="58"/><text class="bit" x="502" y="98">IE1</text><text class="idx" x="502" y="140">D3</text>
    <rect class="cell" x="560" y="60" width="105" height="58"/><text class="bit" x="612" y="98">IT1</text><text class="idx" x="612" y="140">D2</text>
    <rect class="cell" x="670" y="60" width="105" height="58"/><text class="bit" x="722" y="98">IE0</text><text class="idx" x="722" y="140">D1</text>
    <rect class="cell hot" x="780" y="60" width="105" height="58"/><text class="bit" x="832" y="98">IT0</text><text class="idx" x="832" y="140">D0</text>
  </g>

  <text class="cap" x="10" y="180">本节只用 IT0：置 1 = 下降沿触发外部中断 0</text>
</svg>
```

**改法**：只改八个 `<text class="bit">` 的内容；这一节要讲哪一位，就给那个 `rect` 加 `hot`。底部一句话点出重点，别把八位逐个解释——那是讲稿的事。

---

## compare —— 两列对照

适合：赋值 vs 关系、位操作 vs 字节操作、查询 vs 中断。

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300"
     font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif">
  <defs><style>
    .col{fill:#fff;stroke:#C9D8EC;stroke-width:2;rx:14}
    .col.hot{fill:#EAF1FA;stroke:#064FA1}
    .h{font:600 26px sans-serif;fill:#064FA1}
    .t{font:22px sans-serif;fill:#1a1a1a}
    .c{font:22px ui-monospace,Menlo,monospace;fill:#8A2B2F}
  </style></defs>

  <rect class="col hot" x="10" y="20" width="425" height="260"/>
  <text class="h" x="40" y="66">赋值运算符</text>
  <text class="c" x="40" y="118">a = a + b</text>
  <text class="t" x="40" y="164">先算右边</text>
  <text class="t" x="40" y="202">再装进左边的变量</text>
  <text class="t" x="40" y="248">结果是"值"</text>

  <rect class="col" x="465" y="20" width="425" height="260"/>
  <text class="h" x="495" y="66">关系运算符</text>
  <text class="c" x="495" y="118">a == b</text>
  <text class="t" x="495" y="164">比较两边</text>
  <text class="t" x="495" y="202">给 if / while 用</text>
  <text class="t" x="495" y="248">结果只有真 / 假</text>
</svg>
```

**改法**：左列加 `hot` 表示"本节主角"。每列不超过四行，多了就该拆两页。

---

## timeline —— 时序 / 阶段

适合：定时器溢出、串口收发、中断响应时序。

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 200"
     font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif">
  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
            orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#9BB4D4"/></marker>
    <style>
      .axis{stroke:#9BB4D4;stroke-width:3;marker-end:url(#a)}
      .tick{stroke:#C9D8EC;stroke-width:2}
      .dot{fill:#064FA1}
      .t{font:22px sans-serif;fill:#1a1a1a;text-anchor:middle}
      .m{font:19px ui-monospace,Menlo,monospace;fill:#555;text-anchor:middle}
    </style>
  </defs>

  <line class="axis" x1="30" y1="110" x2="880" y2="110"/>
  <g>
    <line class="tick" x1="140" y1="96" x2="140" y2="124"/><circle class="dot" cx="140" cy="110" r="7"/>
    <text class="t" x="140" y="76">装初值</text><text class="m" x="140" y="152">TH0/TL0</text>

    <line class="tick" x1="420" y1="96" x2="420" y2="124"/><circle class="dot" cx="420" cy="110" r="7"/>
    <text class="t" x="420" y="76">启动计数</text><text class="m" x="420" y="152">TR0 = 1</text>

    <line class="tick" x1="700" y1="96" x2="700" y2="124"/><circle class="dot" cx="700" cy="110" r="7"/>
    <text class="t" x="700" y="76">溢出置位</text><text class="m" x="700" y="152">TF0 = 1</text>
  </g>
</svg>
```

**改法**：节点均匀分布在轴上，上方写"发生了什么"，下方写"对应哪个寄存器位"。节点不超过五个。
