#!/usr/bin/env python3
"""声明 → SVG 示意图渲染器（只用标准库，不联网）。

用法:
    python3 figure.py spec.json            # 输出 SVG 到 stdout
    python3 figure.py spec.json -o out.svg
    echo '{...}' | python3 figure.py -

为什么是「声明 + 渲染器」而不是让模型直接写 SVG：
坐标由代码算，同一类图的框宽、间距、对齐永远一致；模型只负责内容，改文案就是改文案。
模型手写 SVG 每次构图都不一样，一处坐标算错就错位，而且没法批量改配色。

声明格式见 SKILL.md，四种 type：flow / compare / bitfield / timeline。
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from html import escape

# ── 主题 ────────────────────────────────────────────────
THEME = {
    "brand": "#064FA1",      # 主色：重点框描边、强调字
    "soft": "#EAF1FA",       # 主色框的填充
    "line": "#C9D8EC",       # 次级描边
    "arrow": "#9BB4D4",      # 箭头、轴线
    "text": "#1a1a1a",
    "muted": "#555",
    "accent": "#8A2B2F",     # 易错点、结论
    "rule": "#E5E5E5",
    "font": "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    "mono": "ui-monospace, Menlo, Consolas, monospace",
}

BASE_W = 900     # viewBox 基准宽；高度按内容算
PAD = 10


def canvas_width(scale) -> int:
    """图里的字号是 viewBox 单位，最终多大取决于图被塞进多宽的 grid。

    textScale 不改字号，改画布宽度（900 / scale）：画布窄了，同样的字在最终画面里
    就显得大。想让图里的字跟旁边正文一样大时调它。与 src/figure 的实现保持一致。
    """
    try:
        factor = float(scale) if scale else 1.0
    except (TypeError, ValueError):
        factor = 1.0
    # 半数向上，与 JS 的 Math.round 一致（900/1.6 = 562.5：Python 的 round 会给 562）
    return int(math.floor(BASE_W / min(3.0, max(0.5, factor)) + 0.5))


def px(value: float) -> str:
    """坐标取整：半数向上，与 JavaScript 的 toFixed(0) 一致。

    插件里有一份等价的 TypeScript 渲染器（src/figure），同一份声明两边必须渲染出
    完全相同的 SVG；Python 的 f"{x:.0f}" 是「四舍六入五取偶」，452.5 会变成 452，
    而 JS 给 453 —— 不统一的话，预览里调好的图用命令行重渲就会挪位。
    """
    return str(int(math.floor(value + 0.5)))


def text_width(s: str, size: float) -> float:
    """粗估文本宽度：中日韩按一个字宽算，其余按半个。够用来定框宽。"""
    units = sum(2 if ord(c) > 0x2E80 else 1 for c in s)
    return units * size * 0.5


def esc(s) -> str:
    return escape(str(s), quote=False)


def rich(s: str, mono: str) -> str:
    """反引号包住的片段切成等宽字体：`a == b` 判断 → <tspan>a == b</tspan> 判断。

    作者写声明时会照着 Markdown 的习惯敲反引号，直接输出就成了字面上的反引号。
    """
    parts = str(s).split("`")
    out = []
    for i, part in enumerate(parts):
        if not part:
            continue
        if i % 2:                       # 奇数段落在一对反引号之间
            out.append(f'<tspan font-family="{mono}">{esc(part)}</tspan>')
        else:
            out.append(esc(part))
    return "".join(out)


def svg_open(width: int, height: int, t: dict) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'font-family="{t["font"]}">',
        "  <defs>",
        '    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
        'markerHeight="7" orient="auto-start-reverse">'
        f'<path d="M0 0 L10 5 L0 10 z" fill="{t["arrow"]}"/></marker>',
        "    <style>",
        f'      .chip{{fill:{t["soft"]};stroke:{t["brand"]};stroke-width:2;rx:12}}',
        f'      .step{{fill:#fff;stroke:{t["line"]};stroke-width:2;rx:12}}',
        f'      .op{{font:600 30px {t["mono"]};fill:{t["brand"]}}}',
        f'      .t{{font:22px sans-serif;fill:{t["text"]}}}',
        f'      .m{{font:20px {t["mono"]};fill:{t["muted"]}}}',
        f'      .lead{{font:600 22px sans-serif;fill:{t["accent"]}}}',
        f'      .h{{font:600 26px sans-serif;fill:{t["brand"]}}}',
        f'      .arr{{stroke:{t["arrow"]};stroke-width:3;marker-end:url(#a)}}',
        "    </style>",
        "  </defs>",
    ]


# ── flow：一行一条流程 ──────────────────────────────────
def render_flow(spec: dict, t: dict) -> str:
    W = canvas_width(spec.get("textScale"))
    rows = spec["rows"]
    row_h, gap_y, box_h = 124, 0, 60
    height = PAD * 2 + len(rows) * row_h - (row_h - box_h - 30)
    out = svg_open(W, height, t)

    for i, row in enumerate(rows):
        y = PAD + 16 + i * row_h
        if i:
            out.append(
                f'  <line x1="{PAD}" y1="{y - 32}" x2="{W - PAD}" y2="{y - 32}" '
                f'stroke="{t["rule"]}" stroke-width="2"/>'
            )
        x = PAD
        chip = str(row.get("chip", ""))
        if chip:
            w = max(110, text_width(chip, 30) + 46)
            out += [
                f'  <rect class="chip" x="{px(x)}" y="{y}" width="{px(w)}" height="{box_h}"/>',
                f'  <text class="op" x="{px(x + w / 2)}" y="{y + 40}" text-anchor="middle">{esc(chip)}</text>',
            ]
            x += w + 12
        for step in row.get("steps", []):
            out.append(f'  <line class="arr" x1="{px(x)}" y1="{y + 30}" x2="{px(x + 44)}" y2="{y + 30}"/>')
            x += 54
            w = max(140, text_width(str(step), 22) + 44)
            out += [
                f'  <rect class="step" x="{px(x)}" y="{y}" width="{px(w)}" height="{box_h}"/>',
                f'  <text class="t" x="{px(x + w / 2)}" y="{y + 37}" '
                f'text-anchor="middle">{rich(step, t["mono"])}</text>',
            ]
            x += w + 12
        note = row.get("note")
        if note:
            nx = min(x + 14, W - PAD - text_width(str(note), 20))
            title = row.get("note_title")
            if title:
                out.append(f'  <text class="lead" x="{px(nx)}" y="{y + 26}">{esc(title)}</text>')
                out.append(f'  <text class="m" x="{px(nx)}" y="{y + 54}">{esc(note)}</text>')
            else:
                out.append(f'  <text class="m" x="{px(nx)}" y="{y + 38}">{esc(note)}</text>')

    out.append("</svg>")
    return "\n".join(out)


# ── compare：两三列对照 ────────────────────────────────
def render_compare(spec: dict, t: dict) -> str:
    W = canvas_width(spec.get("textScale"))
    cols = spec["columns"]
    n = len(cols)
    gap = 30
    cw = (W - PAD * 2 - gap * (n - 1)) / n
    rows = max(len(c.get("lines", [])) for c in cols)
    height = PAD * 2 + 70 + rows * 40 + 20
    out = svg_open(W, height, t)

    for i, col in enumerate(cols):
        x = PAD + i * (cw + gap)
        cls = "chip" if col.get("highlight") else "step"
        out += [
            f'  <rect class="{cls}" x="{px(x)}" y="{PAD}" width="{px(cw)}" height="{px(height - PAD * 2)}"/>',
            f'  <text class="h" x="{px(x + 26)}" y="{PAD + 46}">{esc(col.get("title", ""))}</text>',
        ]
        for j, line in enumerate(col.get("lines", [])):
            y = PAD + 92 + j * 40
            out.append(
                f'  <text class="t" x="{px(x + 26)}" y="{y}">{rich(line, t["mono"])}</text>'
            )

    out.append("</svg>")
    return "\n".join(out)


# ── bitfield：寄存器位分布 ─────────────────────────────
def render_bitfield(spec: dict, t: dict) -> str:
    W = canvas_width(spec.get("textScale"))
    bits = spec["bits"]                      # 高位在前
    n = len(bits)
    highlight = set(spec.get("highlight", []))
    caption = spec.get("caption")
    height = 200 if caption else 165
    out = svg_open(W, height, t)

    if spec.get("name"):
        out.append(f'  <text class="op" x="{PAD}" y="42">{esc(spec["name"])}</text>')
        meta = " · ".join(x for x in [spec.get("addr"), spec.get("meta")] if x)
        if meta:
            out.append(f'  <text class="m" x="{PAD + 120}" y="42">{esc(meta)}</text>')

    gap = 5
    cw = (W - PAD * 2 - gap * (n - 1)) / n
    for i, bit in enumerate(bits):
        x = PAD + i * (cw + gap)
        hot = bit in highlight or (n - 1 - i) in highlight
        out += [
            f'  <rect class="{"chip" if hot else "step"}" x="{px(x)}" y="60" '
            f'width="{px(cw)}" height="58"/>',
            f'  <text class="op" x="{px(x + cw / 2)}" y="99" text-anchor="middle" '
            f'style="font-size:24px">{esc(bit)}</text>',
            f'  <text class="m" x="{px(x + cw / 2)}" y="140" text-anchor="middle" '
            f'style="font-size:18px;fill:#888">D{n - 1 - i}</text>',
        ]
    if caption:
        out.append(f'  <text class="lead" x="{PAD}" y="182">{esc(caption)}</text>')

    out.append("</svg>")
    return "\n".join(out)


# ── timeline：时序 / 阶段 ──────────────────────────────
def render_timeline(spec: dict, t: dict) -> str:
    W = canvas_width(spec.get("textScale"))
    nodes = spec["nodes"]
    height = 200
    out = svg_open(W, height, t)
    y = 110
    out.append(f'  <line class="arr" x1="30" y1="{y}" x2="{W - 20}" y2="{y}"/>')

    n = len(nodes)
    span = (W - 140) / max(n, 1)
    for i, node in enumerate(nodes):
        x = 100 + i * span
        out += [
            f'  <line x1="{px(x)}" y1="{y - 14}" x2="{px(x)}" y2="{y + 14}" '
            f'stroke="{t["line"]}" stroke-width="2"/>',
            f'  <circle cx="{px(x)}" cy="{y}" r="7" fill="{t["brand"]}"/>',
            f'  <text class="t" x="{px(x)}" y="{y - 34}" text-anchor="middle">'
            f'{esc(node.get("label", ""))}</text>',
        ]
        if node.get("sub"):
            out.append(
                f'  <text class="m" x="{px(x)}" y="{y + 42}" text-anchor="middle" '
                f'style="font-size:19px">{esc(node["sub"])}</text>'
            )

    out.append("</svg>")
    return "\n".join(out)


RENDERERS = {
    "flow": render_flow,
    "compare": render_compare,
    "bitfield": render_bitfield,
    "timeline": render_timeline,
}


def render(spec: dict, theme_override: dict | None = None) -> str:
    kind = spec.get("type")
    if kind not in RENDERERS:
        raise SystemExit(f"未知的 type: {kind!r}，可用：{', '.join(RENDERERS)}")
    theme = {**THEME, **(spec.get("theme") or {}), **(theme_override or {})}
    return RENDERERS[kind](spec, theme)


def main() -> None:
    ap = argparse.ArgumentParser(description="声明 → SVG 示意图")
    ap.add_argument("spec", help="声明文件（JSON），写 - 从标准输入读")
    ap.add_argument("-o", "--out", help="输出文件，默认写到标准输出")
    ap.add_argument("--theme", help="覆盖配色的 JSON 文件")
    args = ap.parse_args()

    raw = sys.stdin.read() if args.spec == "-" else open(args.spec, encoding="utf-8").read()
    spec = json.loads(raw)
    theme = json.loads(open(args.theme, encoding="utf-8").read()) if args.theme else None

    svg = render(spec, theme)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(svg + "\n")
        print(f"→ {args.out}", file=sys.stderr)
    else:
        print(svg)


if __name__ == "__main__":
    main()
