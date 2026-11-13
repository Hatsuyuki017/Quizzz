#!/usr/bin/env python3
"""Copy the library icons that the palette tables use into tools/palettes/lib.json.

    npm i --prefix /tmp/icons @iconify-json/ph @iconify-json/tabler @iconify-json/lucide \\
        @iconify-json/fluent-emoji-high-contrast @iconify-json/game-icons @iconify-json/mdi \\
        @iconify-json/icon-park-outline @iconify-json/fa6-solid @iconify-json/maki @iconify-json/temaki
    python3 tools/pull_icons.py /tmp/icons/node_modules

A table refers to a library icon as 'U <set>:<name>'. Only the icons actually
referred to are copied, each with the size of its drawing box; the licence of
every set is recorded under "_sets" and repeated in the README.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "palettes"
SETS = {"ph": "ph", "tabler": "tabler", "lucide": "lucide", "fe": "fluent-emoji-high-contrast", "gi": "game-icons",
        "mdi": "mdi", "ip": "icon-park-outline", "fa": "fa6-solid", "maki": "maki", "temaki": "temaki"}


def main():
    nm = Path(sys.argv[1]) / "@iconify-json"
    wanted = set()
    for f in sorted(SRC.glob("*.txt")):
        wanted.update(re.findall(r"\bU\s+([a-z0-9]+:[a-z0-9-]+)", f.read_text(encoding="utf-8")))
    out, data, missing = {"_sets": {}}, {}, []
    for ref in sorted(wanted):
        short, name = ref.split(":")
        if short not in SETS:
            missing.append(ref)
            continue
        if short not in data:
            d = json.loads((nm / SETS[short] / "icons.json").read_text(encoding="utf-8"))
            info = json.loads((nm / SETS[short] / "info.json").read_text(encoding="utf-8"))
            data[short] = d
            out["_sets"][short] = {"name": info["name"], "author": info["author"]["name"], "license": info["license"]["title"],
                                   "url": info["author"].get("url", "")}
        d = data[short]
        ic = d["icons"].get(name)
        if ic is None and name in d.get("aliases", {}):
            ic = d["icons"].get(d["aliases"][name]["parent"])
        if ic is None:
            missing.append(ref)
            continue
        out[ref] = {"w": ic.get("width", d.get("width", 16)), "h": ic.get("height", d.get("height", 16)), "body": ic["body"]}
    (SRC / "lib.json").write_text(json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")
    print(len(out) - 1, "icons from", len(out["_sets"]), "sets")
    if missing:
        print("missing:", " ".join(missing))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
