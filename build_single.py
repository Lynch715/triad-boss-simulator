#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "index.html"
OUTPUT = ROOT / "模拟社团老大-单文件版.html"

ASSET = r"assets/[a-z0-9-]+\.(?:webp|png)"


def data_uri(path: Path) -> str:
    mime = "image/webp" if path.suffix.lower() == ".webp" else "image/png"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def main() -> None:
    html = SOURCE.read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    js = (ROOT / "app.js").read_text(encoding="utf-8")

    # JS 只认带引号的字面量，免得把注释里提到的路径当成真依赖。
    refs = sorted(set(re.findall(ASSET, html)) | set(re.findall(rf'"({ASSET})"', js)))
    missing = [ref for ref in refs if not (ROOT / ref).exists()]
    if missing:
        raise SystemExit("Missing assets: " + ", ".join(missing))
    uris = {ref: data_uri(ROOT / ref) for ref in refs}

    # 每张图只内嵌一次，用一张查找表引用；沈川、沈振海的立绘分别被引用 8 次和 5 次，
    # 逐处内联会让成品多出一倍体积。
    # 只改写 HTML 里的静态 <img>；app.js 里的路径字面量保持原样，由 assetUrl() 在写进 src
    # 时才查表——把 data URI 塞回 CHARACTER_DEFS 会经 cloneOfficer 混进 localStorage 存档。
    html = re.sub(rf'src="({ASSET})"', r'data-asset="\1"', html)

    table = ",".join(f"{json.dumps(ref)}:{json.dumps(uris[ref])}" for ref in refs)
    # 单独一个 <script>，好让 app.js 的 "use strict" 仍是它自己脚本的第一条语句。
    loader = (
        f"<script>\nconst ASSETS={{{table}}};\n"
        'document.querySelectorAll("[data-asset]").forEach(el=>{el.src=ASSETS[el.dataset.asset]});\n'
        "</script>"
    )

    # re.sub 会把替换串当模板解析，CSS 里出现反斜杠（如 content:"\201C"）会被重新解释，
    # 所以这里用 lambda 原样传入。
    html = re.sub(
        r'<link rel="stylesheet" href="style\.css(?:\?v=\d+)?">',
        lambda _: f"<style>\n{css}\n</style>",
        html,
    )
    # 版本号每次改版都会变，用正则匹配，免得忘了同步这里导致脚本没被内联。
    html = re.sub(r'<script src="app\.js(?:\?v=\d+)?"></script>', lambda _: f"{loader}\n<script>\n{js}\n</script>", html)

    # 单文件版离开仓库也要有图标：小图标和 iOS 主屏图标内嵌，favicon.ico 和 manifest 依赖目录结构，单文件里去掉。
    html = re.sub(r'\s*<link rel="icon" href="favicon\.ico"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
    for ref in ("icon/icon-32.png", "icon/icon-180.png"):
        if (ROOT / ref).exists():
            html = html.replace(f'href="{ref}"', f'href="{data_uri(ROOT / ref)}"')

    # 只看属性，别看正文：注释里提到文件名不算外部依赖。
    external = sorted(set(re.findall(r'(?:href|src)="[^"]*\.(?:css|js)(?:\?[^"]*)?"', html)))
    if external:
        raise SystemExit("CSS/JS external dependency remained: " + ", ".join(external))
    leftover = sorted(set(re.findall(rf'(?:src|href)="{ASSET}"', html)))
    if leftover:
        raise SystemExit("Image dependency remained: " + ", ".join(leftover))
    duped = [f"{ref} x{html.count(uris[ref])}" for ref in refs if html.count(uris[ref]) != 1]
    if duped:
        raise SystemExit("Image not embedded exactly once: " + ", ".join(duped))

    OUTPUT.write_text(html, encoding="utf-8")
    print(f"built {OUTPUT.name}: {OUTPUT.stat().st_size} bytes; {len(refs)} images embedded")


if __name__ == "__main__":
    main()
