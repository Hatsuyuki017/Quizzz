#!/usr/bin/env python3
"""Build js/palettes.js from the tables in tools/palettes/.

    python3 tools/build_palettes.py

Sources
  tools/palettes/seed.json   the first 51 palettes, colours fixed by hand
  tools/palettes/core.txt    their Chinese name, texture, icon and note:
                               id | 中文名 | texture | icon | 小传
  tools/palettes/<group>.txt one table per collection:
                               id | Name | 中文名 | source | bg a b c d | texture | icon | 小传

For the group tables only five colours are written: the paper and four
accents. The ink and the fifth accent are derived, and every colour is then
nudged until text, accent and course colours reach the contrast floors below
on the surface the app will actually derive. The hue family and the style tag
used by the picker's filters are computed here as well.

Notes are written in Chinese. Keep the character '|' out of every cell.

Icon notation (24 x 24 box, parts separated by ';'):
  C cx cy r        filled circle      c  stroked circle
  R x y w h [rx]   filled rectangle   r  stroked rectangle
  E cx cy rx ry    filled ellipse     e  stroked ellipse
  L x1 y1 x2 y2    line
  P x,y x,y ...    filled polygon     p  open polyline
  D <path data>    filled path        d  stroked path
A part may end in @a @b @c @d (a palette colour), @k (ink) or @g (paper).
"""
import colorsys
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "palettes"
GROUPS = ["ledger", "rock", "anime", "classical", "renaissance", "film", "china", "japan", "place", "book", "game", "people"]
SEED_GROUP = {"zima-blue": "film", "lamplight": "ledger"}
ROCK_FROM, ROCK_TO = "mellon-collie", "kid-a"
TEXTURES = {"none", "stars", "dots", "grid", "hatch", "rain", "blinds", "bars", "waves", "checks", "weave", "rings", "snow", "rays", "tiles"}
KEEP_SURFACE = {"zima-blue": "#FFFFFF", "velvet-underground": "#FFFDF8"}
W = (255, 255, 255)


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tohex(c):
    return "#%02X%02X%02X" % tuple(max(0, min(255, round(v))) for v in c)


def mix(a, pa, b):
    return tuple(a[i] * pa + b[i] * (1 - pa) for i in range(3))


def lum(c):
    f = lambda v: (v / 255 / 12.92) if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def is_dark(bg):
    return (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255 < 0.4


def surface(pid, bg):
    if pid in KEEP_SURFACE:
        return hx(KEEP_SURFACE[pid])
    return mix(W, 0.07, bg) if is_dark(bg) else mix(bg, 0.26, W)


def push(c, surf, floor, dark):
    """Move a colour away from the surface until it clears the contrast floor."""
    target = (255, 255, 255) if dark else (0, 0, 0)
    n = 0
    while contrast(c, surf) < floor and n < 60:
        c = mix(target, 0.035, c)
        n += 1
    return c


def hsl(c):
    h, l, s = colorsys.rgb_to_hls(c[0] / 255, c[1] / 255, c[2] / 255)
    return h * 360, s, l


def hue_family(c):
    h, s, l = hsl(c)
    if s < 0.13 or l > 0.93 or l < 0.07:
        return "neutral"
    if (h < 50 and h >= 12) and l < 0.42 and s < 0.62:
        return "brown"
    for limit, name in ((14, "red"), (42, "orange"), (68, "yellow"), (165, "green"), (200, "cyan"), (256, "blue"), (322, "purple"), (344, "pink")):
        if h < limit:
            return name
    return "red"


def chroma(c):
    _, s, l = hsl(c)
    return s * (1 - abs(2 * l - 1))


def style_of(bg, accents):
    """mono, muted, soft or vivid, from the mean chroma of the four lead colours."""
    ch = sum(chroma(c) for c in accents) / len(accents)
    if ch < 0.10:
        return "mono"
    lo, hi = (0.34, 0.42) if is_dark(bg) else (0.26, 0.37)
    return "vivid" if ch > hi else ("soft" if ch > lo else "muted")


NUM = r"-?\d*\.?\d+"


def icon_svg(spec, where):
    out = []
    for part in [p.strip() for p in spec.split(";") if p.strip()]:
        colour = "currentColor"
        m = re.search(r"@([abcdkg])$", part)
        if m:
            colour = {"k": "var(--p-ink)", "g": "var(--p-bg)"}.get(m.group(1), "var(--p-%s)" % m.group(1))
            part = part[:m.start()].strip()
        kind, rest = part[0], part[1:].strip()
        filled = kind.isupper()
        paint = f'fill="{colour}"' if filled else f'fill="none" stroke="{colour}"'
        k = kind.lower()
        nums = re.findall(NUM, rest)
        try:
            if k == "c":
                out.append(f'<circle cx="{nums[0]}" cy="{nums[1]}" r="{nums[2]}" {paint}/>')
            elif k == "r":
                rx = f' rx="{nums[4]}"' if len(nums) > 4 else ""
                out.append(f'<rect x="{nums[0]}" y="{nums[1]}" width="{nums[2]}" height="{nums[3]}"{rx} {paint}/>')
            elif k == "e":
                out.append(f'<ellipse cx="{nums[0]}" cy="{nums[1]}" rx="{nums[2]}" ry="{nums[3]}" {paint}/>')
            elif k == "l":
                out.append(f'<line x1="{nums[0]}" y1="{nums[1]}" x2="{nums[2]}" y2="{nums[3]}" stroke="{colour}"/>')
            elif k == "p":
                tag = "polygon" if filled else "polyline"
                out.append(f'<{tag} points="{rest}" {paint}/>')
            elif k == "d":
                out.append(f'<path d="{rest}" {paint}/>')
            else:
                raise ValueError(kind)
        except (IndexError, ValueError):
            raise SystemExit(f"{where}: bad icon part {part!r}")
    return "".join(out)


def rows(path, n):
    for ln, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        cells = [c.strip() for c in line.split("|")]
        if len(cells) != n:
            raise SystemExit(f"{path.name}:{ln}: expected {n} cells, found {len(cells)}")
        yield ln, cells


def main():
    out, seen, problems = [], set(), []
    seed = json.loads((SRC / "seed.json").read_text(encoding="utf-8"))
    core = {c[0]: c for _, c in rows(SRC / "core.txt", 5)}
    in_rock = False
    for s in seed:
        pid = s["id"]
        if pid == ROCK_FROM:
            in_rock = True
        group = SEED_GROUP.get(pid, "rock" if in_rock else "ledger")
        if pid == ROCK_TO:
            in_rock = False
        if pid not in core:
            raise SystemExit(f"core.txt has no row for {pid}")
        _, zh, tex, icon, bio = core[pid]
        cols = [hx(s["bg"]), hx(s["ink"])] + [hx(c) for c in s["cats"]]
        out.append(dict(id=pid, n=s["name"], z=zh, src=s["title"] or s["name"], g=group, tex=tex, icon=icon, bio=bio, cols=cols))
    for group in GROUPS[2:]:
        path = SRC / f"{group}.txt"
        if not path.exists():
            raise SystemExit(f"missing {path}")
        for ln, (pid, name, zh, src, colours, tex, icon, bio) in rows(path, 8):
            where = f"{path.name}:{ln}"
            raw = colours.split()
            if len(raw) != 5 or not all(re.fullmatch(r"#[0-9A-Fa-f]{6}", c) for c in raw):
                raise SystemExit(f"{where}: need five #RRGGBB colours (bg a b c d)")
            bg, a, b, c, d = [hx(x) for x in raw]
            dark = is_dark(bg)
            surf = surface(pid, bg)
            ink = mix(a, 0.10, (246, 242, 234)) if dark else mix(a, 0.14, (18, 18, 21))
            ink = push(ink, surf, 11.5 if dark else 12.5, dark)
            a = push(a, surf, 5.6 if dark else 4.6, dark)
            b, c, d = [push(x, surf, 4.1 if dark else 3.3, dark) for x in (b, c, d)]
            e = push(mix(ink, 0.62, bg), surf, 4.1 if dark else 3.3, dark)
            out.append(dict(id=pid, n=name, z=zh, src=src, g=group, tex=tex, icon=icon, bio=bio, cols=[bg, ink, a, b, c, d, e]))
    js = []
    for p in out:
        pid = p["id"]
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", pid) or pid in seen:
            problems.append(f"{pid}: bad or duplicate id")
        seen.add(pid)
        if p["tex"] not in TEXTURES:
            problems.append(f"{pid}: unknown texture {p['tex']}")
        if not p["bio"] or not p["z"]:
            problems.append(f"{pid}: missing name or note")
        bg, ink, a, b, c, d, e = p["cols"]
        lead = bg if chroma(bg) > 0.24 else a
        js.append({
            "id": pid, "n": p["n"], "z": p["z"], "src": p["src"], "g": p["g"],
            "bg": tohex(bg), "ink": tohex(ink), "cats": [tohex(x) for x in (a, b, c, d, e)],
            "dark": is_dark(bg), "h": hue_family(lead), "s": style_of(bg, [a, b, c, d]),
            "tex": p["tex"], "icon": icon_svg(p["icon"], pid), "bio": p["bio"],
        })
    if problems:
        print("\n".join(problems))
        return 1
    body = ",\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in js)
    text = ("/* palettes.js — generated by tools/build_palettes.py from tools/palettes/. Do not edit by hand.\n"
            "   Each entry: id, name, Chinese name, source, group, the seven colours, light or dark, hue family,\n"
            "   style, spine texture, icon (SVG in a 24 x 24 box) and a short note. */\n"
            "(window.QL = window.QL || {}).PALETTES = [\n" + body + "\n];\n"
            "window.QL.PALETTE_GROUPS = " + json.dumps(GROUPS) + ";\n")
    (ROOT / "js" / "palettes.js").write_text(text, encoding="utf-8")
    from collections import Counter
    print(len(js), "palettes |", dict(Counter(x["g"] for x in js)))
    print("hue:", dict(Counter(x["h"] for x in js)), "| style:", dict(Counter(x["s"] for x in js)), "| dark:", sum(x["dark"] for x in js))
    return 0


if __name__ == "__main__":
    sys.exit(main())
