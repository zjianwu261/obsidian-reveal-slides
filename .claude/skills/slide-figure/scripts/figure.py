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

W = 900          # viewBox 宽，固定；高度按内容算
PAD = 10


def text_width(s: str, size: float) -> float:
    """粗估文本宽度：中日韩按一个字宽算，其余按半个。够用来定框宽。"""
    units = sum(2 if ord(c) > 0x2E80 else 1 for c in s)
    return units * size * 0.5


def esc(s) -> str:
    return escape(str(s), quote=False)


def svg_open(height: int, t: dict) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {height}" '
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
    rows = spec["rows"]
    row_h, gap_y, box_h = 124, 0, 60
    height = PAD * 2 + len(rows) * row_h - (row_h - box_h - 30)
    out = svg_open(height, t)

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
                f'  <rect class="chip" x="{x}" y="{y}" width="{w:.0f}" height="{box_h}"/>',
                f'  <text class="op" x="{x + w / 2:.0f}" y="{y + 40}" text-anchor="middle">{esc(chip)}</text>',
            ]
            x += w + 12
        for step in row.get("steps", []):
            out.append(f'  <line class="arr" x1="{x}" y1="{y + 30}" x2="{x + 44}" y2="{y + 30}"/>')
            x += 54
            w = max(140, text_width(str(step), 22) + 44)
            out += [
                f'  <rect class="step" x="{x}" y="{y}" width="{w:.0f}" height="{box_h}"/>',
                f'  <text class="t" x="{x + w / 2:.0f}" y="{y + 37}" text-anchor="middle">{esc(step)}</text>',
            ]
            x += w + 12
        note = row.get("note")
        if note:
            nx = min(x + 14, W - PAD - text_width(str(note), 20))
            title = row.get("note_title")
            if title:
                out.append(f'  <text class="lead" x="{nx:.0f}" y="{y + 26}">{esc(title)}</text>')
                out.append(f'  <text class="m" x="{nx:.0f}" y="{y + 54}">{esc(note)}</text>')
            else:
                out.append(f'  <text class="m" x="{nx:.0f}" y="{y + 38}">{esc(note)}</text>')

    out.append("</svg>")
    return "\n".join(out)


# ── compare：两三列对照 ────────────────────────────────
def render_compare(spec: dict, t: dict) -> str:
    cols = spec["columns"]
    n = len(cols)
    gap = 30
    cw = (W - PAD * 2 - gap * (n - 1)) / n
    rows = max(len(c.get("lines", [])) for c in cols)
    height = PAD * 2 + 70 + rows * 40 + 20
    out = svg_open(height, t)

    for i, col in enumerate(cols):
        x = PAD + i * (cw + gap)
        cls = "chip" if col.get("highlight") else "step"
        out += [
            f'  <rect class="{cls}" x="{x:.0f}" y="{PAD}" width="{cw:.0f}" height="{height - PAD * 2:.0f}"/>',
            f'  <text class="h" x="{x + 26:.0f}" y="{PAD + 46}">{esc(col.get("title", ""))}</text>',
        ]
        for j, line in enumerate(col.get("lines", [])):
            y = PAD + 92 + j * 40
            mono = str(line).startswith("`") and str(line).endswith("`")
            body = str(line).strip("`")
            cls = "m" if mono else "t"
            out.append(f'  <text class="{cls}" x="{x + 26:.0f}" y="{y}">{esc(body)}</text>')

    out.append("</svg>")
    return "\n".join(out)


# ── bitfield：寄存器位分布 ─────────────────────────────
def render_bitfield(spec: dict, t: dict) -> str:
    bits = spec["bits"]                      # 高位在前
    n = len(bits)
    highlight = set(spec.get("highlight", []))
    caption = spec.get("caption")
    height = 200 if caption else 165
    out = svg_open(height, t)

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
            f'  <rect class="{"chip" if hot else "step"}" x="{x:.0f}" y="60" '
            f'width="{cw:.0f}" height="58"/>',
            f'  <text class="op" x="{x + cw / 2:.0f}" y="99" text-anchor="middle" '
            f'style="font-size:24px">{esc(bit)}</text>',
            f'  <text class="m" x="{x + cw / 2:.0f}" y="140" text-anchor="middle" '
            f'style="font-size:18px;fill:#888">D{n - 1 - i}</text>',
        ]
    if caption:
        out.append(f'  <text class="lead" x="{PAD}" y="182">{esc(caption)}</text>')

    out.append("</svg>")
    return "\n".join(out)


# ── timeline：时序 / 阶段 ──────────────────────────────
def render_timeline(spec: dict, t: dict) -> str:
    nodes = spec["nodes"]
    height = 200
    out = svg_open(height, t)
    y = 110
    out.append(f'  <line class="arr" x1="30" y1="{y}" x2="{W - 20}" y2="{y}"/>')

    n = len(nodes)
    span = (W - 140) / max(n, 1)
    for i, node in enumerate(nodes):
        x = 100 + i * span
        out += [
            f'  <line x1="{x:.0f}" y1="{y - 14}" x2="{x:.0f}" y2="{y + 14}" '
            f'stroke="{t["line"]}" stroke-width="2"/>',
            f'  <circle cx="{x:.0f}" cy="{y}" r="7" fill="{t["brand"]}"/>',
            f'  <text class="t" x="{x:.0f}" y="{y - 34}" text-anchor="middle">'
            f'{esc(node.get("label", ""))}</text>',
        ]
        if node.get("sub"):
            out.append(
                f'  <text class="m" x="{x:.0f}" y="{y + 42}" text-anchor="middle" '
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
