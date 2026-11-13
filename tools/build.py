#!/usr/bin/env python3
"""Quiz Ledger build tool: validate the catalog and every bank, then compile figures.

    python3 tools/build.py            validate, compile new or changed figures
    python3 tools/build.py --check    validate only (no TeX needed)
    python3 tools/build.py --force    recompile every figure

Figures are written next to each bank as <bank>.figures.json, a generated file
that maps a figure key to its SVG. The browser never runs TeX.
Needs pdflatex (with TikZ / pgfplots) and pdftocairo (poppler) for figures.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANKS = ROOT / "banks"
BANK_SCHEMA = "quiz-ledger/bank@1"
CATALOG_SCHEMA = "quiz-ledger/catalog@1"
TYPES = ("true_false", "single_choice", "multiple_choice", "fill_blank")
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
BLANK_RE = re.compile(r"_{4,}")
DEFAULT_PREAMBLE = (
    "\\documentclass[tikz,border=4pt]{standalone}\n"
    "\\usepackage{amsmath,amssymb}\n"
    "\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.16}\n"
    "\\usetikzlibrary{arrows.meta}\n"
)


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")


def load_json(path, rep):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        rep.err(str(path.relative_to(ROOT)), f"cannot read JSON ({exc})")
        return None


def is_text(v):
    return isinstance(v, str) and v.strip() != ""


def dollars_balanced(text):
    return text.replace("\\$", "").count("$") % 2 == 0


def check_text(where, field, value, rep, required=True):
    if value is None and not required:
        return
    if not is_text(value):
        rep.err(where, f"`{field}` must be a non-empty string")
    elif not dollars_balanced(value):
        rep.err(where, f"`{field}` has an unpaired $")


def figure_key(q):
    fig = q.get("figure") or {}
    return fig.get("id") or q.get("id")


def validate_bank(path, bank, rep, expect_id=None):
    name = str(path.relative_to(ROOT))
    if bank.get("schema") != BANK_SCHEMA:
        rep.err(name, f'`schema` must be "{BANK_SCHEMA}"')
    bid = bank.get("id")
    if not (isinstance(bid, str) and SLUG_RE.match(bid)):
        rep.err(name, "`id` must be a lowercase slug such as statx303-2026s2")
    elif expect_id and bid != expect_id:
        rep.err(name, f"`id` is {bid!r} but the catalog lists it as {expect_id!r}")
    course = bank.get("course")
    if not isinstance(course, dict) or not is_text(course.get("code")) or not is_text(course.get("title")):
        rep.err(name, "`course.code` and `course.title` are required")
    units = bank.get("units")
    unit_ids = set()
    if not isinstance(units, list) or not units:
        rep.err(name, "`units` must be a non-empty array")
    else:
        for i, u in enumerate(units):
            uid = u.get("id") if isinstance(u, dict) else None
            if not (isinstance(uid, str) and ID_RE.match(uid)) or not is_text(u.get("title")):
                rep.err(name, f"units[{i}] needs an `id` and a `title`")
            elif uid in unit_ids:
                rep.err(name, f"duplicate unit id {uid!r}")
            else:
                unit_ids.add(uid)
    questions = bank.get("questions")
    if not isinstance(questions, list) or not questions:
        rep.err(name, "`questions` must be a non-empty array")
        return
    seen = set()
    figures = {}
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            rep.err(name, f"questions[{i}] must be an object")
            continue
        qid = q.get("id")
        where = f"{name} [{qid if isinstance(qid, str) else i}]"
        if not (isinstance(qid, str) and ID_RE.match(qid)):
            rep.err(where, "`id` must match [A-Za-z0-9._-]+")
        elif qid in seen:
            rep.err(where, "duplicate question id")
        seen.add(qid)
        qtype = q.get("type")
        if qtype not in TYPES:
            rep.err(where, f"`type` must be one of {', '.join(TYPES)}")
            continue
        if q.get("unit") not in unit_ids:
            rep.err(where, f"`unit` {q.get('unit')!r} is not declared in `units`")
        if "difficulty" in q and q["difficulty"] not in (1, 2, 3):
            rep.err(where, "`difficulty` must be 1, 2 or 3")
        check_text(where, "question", q.get("question"), rep)
        check_text(where, "explanation", q.get("explanation"), rep, required=False)
        check_text(where, "topic", q.get("topic"), rep, required=False)
        answer = q.get("answer")
        if qtype in ("single_choice", "multiple_choice"):
            opts = q.get("options")
            labels = []
            if not isinstance(opts, list) or len(opts) < 2:
                rep.err(where, "`options` must list at least two {label, text} objects")
            else:
                for o in opts:
                    if not isinstance(o, dict) or not is_text(o.get("label")):
                        rep.err(where, "every option needs a `label` and a `text`")
                        continue
                    check_text(where, f"options[{o['label']}].text", o.get("text"), rep)
                    labels.append(o["label"])
                if len(set(labels)) != len(labels):
                    rep.err(where, "option labels must be unique")
            if qtype == "single_choice":
                if not isinstance(answer, str) or answer not in labels:
                    rep.err(where, "`answer` must be the label of one option")
            else:
                ok = isinstance(answer, list) and answer and all(a in labels for a in answer)
                if not ok or len(set(answer)) != len(answer):
                    rep.err(where, "`answer` must be an array of distinct option labels")
        elif qtype == "true_false":
            if not isinstance(answer, bool):
                rep.err(where, "`answer` must be true or false")
            if "options" in q:
                rep.warn(where, "`options` is ignored for true_false")
        else:  # fill_blank
            if not isinstance(answer, list) or not answer or not all(is_text(a) for a in answer):
                rep.err(where, "`answer` must be an array with one string per blank")
            else:
                n = len(BLANK_RE.findall(q.get("question") or ""))
                if n != len(answer):
                    rep.err(where, f"{n} blank marker(s) ____ in the question but {len(answer)} answer(s)")
                for a in answer:
                    if not dollars_balanced(a):
                        rep.err(where, "an answer has an unpaired $")
                accept = q.get("accept")
                if accept is not None:
                    ok = isinstance(accept, list) and len(accept) == len(answer) and all(
                        isinstance(alts, list) and all(is_text(x) for x in alts) for alts in accept)
                    if not ok:
                        rep.err(where, "`accept` must hold one array of alternative strings per blank")
        fig = q.get("figure")
        if fig is not None:
            if not isinstance(fig, dict) or not is_text(fig.get("latex")):
                rep.err(where, "`figure` must be null or an object with a `latex` string")
            else:
                key = figure_key(q)
                if key in figures and figures[key] != fig["latex"]:
                    rep.err(where, f"figure id {key!r} is reused with different LaTeX")
                figures[key] = fig["latex"]


def render_svg(tex, timeout=120):
    with tempfile.TemporaryDirectory(prefix="qlfig-") as tmp:
        tmp = Path(tmp)
        (tmp / "fig.tex").write_text(tex, encoding="utf-8")
        run = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "fig.tex"],
            cwd=tmp, capture_output=True, text=True, errors="replace", timeout=timeout)
        if run.returncode != 0 or not (tmp / "fig.pdf").exists():
            lines = [ln for ln in run.stdout.splitlines() if ln.startswith("!") or ln.startswith("l.")]
            raise RuntimeError("; ".join(lines[:4]) or "pdflatex failed")
        run = subprocess.run(["pdftocairo", "-svg", "fig.pdf", "fig.svg"],
                             cwd=tmp, capture_output=True, text=True, timeout=timeout)
        if run.returncode != 0:
            raise RuntimeError(run.stderr.strip() or "pdftocairo failed")
        svg = (tmp / "fig.svg").read_text(encoding="utf-8")
    svg = re.sub(r"^<\?xml[^>]*\?>\s*", "", svg)
    return re.sub(r">\s+<", "><", svg).strip()


def build_figures(path, bank, rep, force=False):
    out_path = path.with_name(path.stem + ".figures.json")
    name = str(path.relative_to(ROOT))
    wanted = {}
    for q in bank.get("questions", []):
        fig = q.get("figure")
        if isinstance(fig, dict) and is_text(fig.get("latex")):
            wanted[figure_key(q)] = fig["latex"]
    if not wanted:
        if out_path.exists():
            out_path.unlink()
        return 0, 0
    old = {}
    if out_path.exists() and not force:
        try:
            old = json.loads(out_path.read_text(encoding="utf-8"))
        except ValueError:
            old = {}
    preamble = bank.get("figure_preamble") or DEFAULT_PREAMBLE
    result, compiled = {}, 0
    for key, latex in wanted.items():
        digest = hashlib.sha1((preamble + "\0" + latex).encode("utf-8")).hexdigest()[:16]
        prev = old.get(key)
        if isinstance(prev, dict) and prev.get("hash") == digest and prev.get("svg"):
            result[key] = prev
            continue
        tex = preamble.rstrip() + "\n\\begin{document}\n" + latex.strip() + "\n\\end{document}\n"
        try:
            result[key] = {"hash": digest, "svg": render_svg(tex)}
            compiled += 1
        except (RuntimeError, subprocess.TimeoutExpired) as exc:
            rep.err(f"{name} [figure {key}]", f"did not compile: {exc}")
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return len(result), compiled


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validate only, do not compile figures")
    ap.add_argument("--force", action="store_true", help="recompile every figure")
    args = ap.parse_args()
    rep = Report()
    catalog = load_json(BANKS / "catalog.json", rep)
    entries = []
    if catalog is not None:
        if catalog.get("schema") != CATALOG_SCHEMA:
            rep.err("banks/catalog.json", f'`schema` must be "{CATALOG_SCHEMA}"')
        seen_ids = set()
        for s in catalog.get("semesters") or []:
            if not (isinstance(s.get("id"), str) and SLUG_RE.match(s["id"])):
                rep.err("banks/catalog.json", "every semester needs a slug `id`")
            for c in s.get("courses") or []:
                cid = c.get("id")
                if not (isinstance(cid, str) and SLUG_RE.match(cid)) or not is_text(c.get("bank")):
                    rep.err("banks/catalog.json", f"course {cid!r} needs a slug `id` and a `bank` path")
                    continue
                if cid in seen_ids:
                    rep.err("banks/catalog.json", f"course id {cid!r} appears twice")
                seen_ids.add(cid)
                entries.append((cid, BANKS / c["bank"]))
        if not entries:
            rep.err("banks/catalog.json", "no courses listed")
    tex_ok = shutil.which("pdflatex") and shutil.which("pdftocairo")
    if not args.check and not tex_ok:
        rep.warn("figures", "pdflatex or pdftocairo not found; figures were not compiled")
    for cid, path in entries:
        bank = load_json(path, rep)
        if bank is None:
            continue
        before = len(rep.errors)
        validate_bank(path, bank, rep, expect_id=cid)
        n = len(bank.get("questions") or [])
        line = f"  {path.relative_to(ROOT)}: {n} questions"
        if len(rep.errors) == before and not args.check and tex_ok:
            total, compiled = build_figures(path, bank, rep, force=args.force)
            line += f", {total} figures ({compiled} compiled)"
        print(line)
    template = ROOT / "templates" / "bank.template.json"
    if template.exists():
        tpl = load_json(template, rep)
        if tpl is not None:
            validate_bank(template, tpl, rep)
    for w in rep.warnings:
        print("warning:", w)
    for e in rep.errors:
        print("error:", e)
    print(f"{len(rep.errors)} error(s), {len(rep.warnings)} warning(s)")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
