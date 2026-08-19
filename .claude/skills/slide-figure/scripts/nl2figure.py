#!/usr/bin/env python3
"""一句话 → 声明 → SVG（可选，需要联网；只用标准库）。

在 Claude Code / Codex 这类智能体里用不到这个脚本——模型自己就能写声明，
直接调 figure.py 更快也更省钱。它是给「脱离智能体单独跑」准备的：
命令行里一句话出图，或者接进你自己的自动化。

任何 OpenAI 兼容的接口都行，DeepSeek 只是默认值：

    export FIGURE_API_KEY=sk-xxx
    python3 nl2figure.py "画一张 TCON 的位分布，这节讲 IT0" -o tcon.svg

换供应商：

    export FIGURE_API_BASE=https://api.openai.com/v1
    export FIGURE_MODEL=gpt-4o-mini

也可以把这三项写进本目录的 config.json，优先级：命令行 > 环境变量 > config.json。
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from figure import RENDERERS, render  # noqa: E402

CONFIG_PATH = pathlib.Path(__file__).resolve().parent.parent / "config.json"
DEFAULTS = {"api_base": "https://api.deepseek.com/v1", "model": "deepseek-chat", "api_key": ""}

SYSTEM = """你把课件作者的一句话，翻译成一份画图声明（JSON）。只输出 JSON，不要解释、不要代码围栏。

type 只能是这四个之一：

flow —— 步骤流程 / 前后对比
{"type":"flow","rows":[{"chip":"++b","steps":["先自增 +1","再参与运算"],
 "note_title":"b = 3 时","note":"c = ++b → 4"}]}

compare —— 两三列对照（highlight 标出本节主角，一列不超过四行）
{"type":"compare","columns":[{"title":"赋值运算符","highlight":true,
 "lines":["`a = a + b`","先算右边"]},{"title":"关系运算符","lines":["`a == b`","比较两边"]}]}

bitfield —— 寄存器位分布（bits 高位在前；highlight 写位名或位号）
{"type":"bitfield","name":"TCON","addr":"0x88","meta":"可位寻址",
 "bits":["TF1","TR1","TF0","TR0","IE1","IT1","IE0","IT0"],"highlight":["IT0"],
 "caption":"本节只用 IT0：置 1 = 下降沿触发"}

timeline —— 时序 / 阶段（节点不超过五个）
{"type":"timeline","nodes":[{"label":"装初值","sub":"TH0/TL0"}]}

约束：文字精炼，投影上要读得清；lines 里用反引号包住代码；
一张图只讲一件事，别把三个概念塞进一张；不要在图里重复幻灯片的标题。"""


def load_config(args) -> dict:
    cfg = dict(DEFAULTS)
    if CONFIG_PATH.exists():
        cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
    for key, env in [("api_base", "FIGURE_API_BASE"), ("model", "FIGURE_MODEL"),
                     ("api_key", "FIGURE_API_KEY")]:
        if os.environ.get(env):
            cfg[key] = os.environ[env]
    for key in ("api_base", "model", "api_key"):
        if getattr(args, key, None):
            cfg[key] = getattr(args, key)
    return cfg


def ask(cfg: dict, prompt: str) -> dict:
    if not cfg["api_key"]:
        raise SystemExit(
            "没有 API key。设 FIGURE_API_KEY 环境变量，或写进 config.json。\n"
            "（在智能体里用的话根本不需要这个脚本：让模型直接写声明，再交给 figure.py）"
        )
    body = json.dumps({
        "model": cfg["model"],
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
        "temperature": 0.2,
    }).encode()
    req = urllib.request.Request(
        cfg["api_base"].rstrip("/") + "/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg['api_key']}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            payload = json.loads(res.read())
    except urllib.error.HTTPError as err:
        raise SystemExit(f"接口报错 {err.code}: {err.read().decode(errors='replace')[:400]}")

    content = payload["choices"][0]["message"]["content"].strip()
    if content.startswith("```"):                      # 模型偶尔仍加围栏
        content = content.split("\n", 1)[1].rsplit("```", 1)[0]
    try:
        spec = json.loads(content)
    except json.JSONDecodeError:
        raise SystemExit(f"模型没给出合法 JSON：\n{content[:400]}")
    if spec.get("type") not in RENDERERS:
        raise SystemExit(f"模型给了未知的 type: {spec.get('type')!r}")
    return spec


def main() -> None:
    ap = argparse.ArgumentParser(description="一句话 → 声明 → SVG")
    ap.add_argument("prompt", help="要画什么，说人话")
    ap.add_argument("-o", "--out", help="SVG 输出文件，默认写到标准输出")
    ap.add_argument("--spec-out", help="同时把声明存下来，方便之后手改重渲")
    ap.add_argument("--api-base", dest="api_base")
    ap.add_argument("--api-key", dest="api_key")
    ap.add_argument("--model", dest="model")
    args = ap.parse_args()

    spec = ask(load_config(args), args.prompt)
    if args.spec_out:
        pathlib.Path(args.spec_out).write_text(
            json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"→ {args.spec_out}", file=sys.stderr)

    svg = render(spec)
    if args.out:
        pathlib.Path(args.out).write_text(svg + "\n", encoding="utf-8")
        print(f"→ {args.out}", file=sys.stderr)
    else:
        print(svg)


if __name__ == "__main__":
    main()
