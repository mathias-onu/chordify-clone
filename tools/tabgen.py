"""Render a guitar tab PDF from a song spec (JSON).

usage: tabgen.py spec.json out.pdf {played|movable}

Spec format (see song specs):
  shapes_played / shapes_movable: {chord: {"frets":[6 ints or "x"], "fingers":[6], "label": optional}}
  patterns: {name: {"desc": str, "events": [[slot, strings_or_"all", stroke_or_finger], ...]}}
     slot 0..15 (16th grid), strings: list of string indices 0=low E .. 5=high e, or "all" (strum)
  sections: [{"name", "note", "pattern", "bars": [bar, ...]}]
     bar = [chord] | [chord, chord] | [c,c,c,c] | {"riff": [[slot, string, fret], ...], "chord": name}
"""
import json, sys
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color, black, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

_FD = "/System/Library/Fonts/Supplemental/"
pdfmetrics.registerFont(TTFont("Helvetica", _FD + "Arial.ttf"))
pdfmetrics.registerFont(TTFont("Helvetica-Bold", _FD + "Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Helvetica-Oblique", _FD + "Arial Italic.ttf"))
pdfmetrics.registerFontFamily("Helvetica", normal="Helvetica", bold="Helvetica-Bold", italic="Helvetica-Oblique", boldItalic="Helvetica-Bold")

GRAY = Color(0.45, 0.45, 0.45)
LIGHT = Color(0.75, 0.75, 0.75)
BLUE = Color(0.10, 0.30, 0.65)
RED = Color(0.70, 0.15, 0.15)

PAGE_W, PAGE_H = landscape(letter)
MARGIN = 34
SLOT_W = 10.5
BAR_W = SLOT_W * 16 + 6
BARS_PER_LINE = 4
LINE_GAP = 8          # distance between tab lines
SYSTEM_H = LINE_GAP * 5 + 58
STRING_NAMES = ["E", "A", "D", "G", "B", "e"]


def fret_str(f):
    return "x" if f in ("x", None) else str(f)


class Doc:
    def __init__(self, path, title):
        self.c = canvas.Canvas(path, pagesize=landscape(letter))
        self.c.setTitle(title)
        self.y = PAGE_H - MARGIN
        self.page = 1
        self.title = title
        self.boxes = []
        self.record = False

    def need(self, h):
        if self.y - h < MARGIN + 14:
            self.footer()
            self.c.showPage()
            self.page += 1
            self.y = PAGE_H - MARGIN

    def footer(self):
        self.c.setFont("Helvetica", 7)
        self.c.setFillColor(GRAY)
        self.c.drawRightString(PAGE_W - MARGIN, MARGIN - 6, f"{self.title}  -  page {self.page}")
        self.c.setFillColor(black)

    def text(self, s, size=9, font="Helvetica", color=black, dy=None, x=None):
        self.need(size + 4)
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        self.c.drawString(x if x is not None else MARGIN, self.y - size, s)
        self.c.setFillColor(black)
        self.y -= (dy if dy is not None else size + 4)

    def wrapped(self, s, size=8.5, width=PAGE_W - 2 * MARGIN, color=black, font="Helvetica"):
        from reportlab.pdfbase.pdfmetrics import stringWidth
        words = s.split()
        line = ""
        for w in words:
            t = (line + " " + w).strip()
            if stringWidth(t, font, size) > width:
                self.text(line, size, font=font, color=color, dy=size + 2.5)
                line = w
            else:
                line = t
        if line:
            self.text(line, size, font=font, color=color, dy=size + 2.5)

    def space(self, h):
        self.y -= h

    # ---- chord diagram -------------------------------------------------
    def chord_diagram(self, x, y, name, shape, w=38, h=46):
        """Draw at top-left (x, y). 6 strings, 5 frets."""
        c = self.c
        frets = shape["frets"]
        fingers = shape.get("fingers", [None] * 6)
        nums = [f for f in frets if f not in ("x", None, 0)]
        base = 1
        if nums and max(nums) > 5:
            base = min(nums)
        sx = w / 5.0
        sy = h / 5.0
        gx = x + 10
        gy = y - 16
        c.setFont("Helvetica-Bold", 8.5)
        c.setFillColor(black)
        c.drawCentredString(gx + w / 2, y - 7, name)
        c.setLineWidth(0.6)
        c.setStrokeColor(black)
        for i in range(6):
            c.line(gx + i * sx, gy, gx + i * sx, gy - h)
        for j in range(6):
            c.setLineWidth(2 if (j == 0 and base == 1) else 0.6)
            c.line(gx, gy - j * sy, gx + w, gy - j * sy)
        c.setLineWidth(0.6)
        if base > 1:
            c.setFont("Helvetica", 6.5)
            c.drawRightString(gx - 2, gy - sy + 2, f"{base}fr")
        c.setFont("Helvetica", 6.5)
        for i, f in enumerate(frets):
            px = gx + i * sx
            if f in ("x", None):
                c.drawCentredString(px, gy + 2.5, "x")
            elif f == 0:
                c.circle(px, gy + 4.5, 2.2, stroke=1, fill=0)
            else:
                row = f - base + 1
                py = gy - (row - 0.5) * sy
                c.setFillColor(black)
                c.circle(px, py, 3.3, stroke=0, fill=1)
                fg = fingers[i] if i < len(fingers) else None
                if fg:
                    c.setFillColor(white)
                    c.setFont("Helvetica-Bold", 5.5)
                    c.drawCentredString(px, py - 2, str(fg))
                    c.setFont("Helvetica", 6.5)
                    c.setFillColor(black)
        # note names under the diagram
        c.setFont("Helvetica", 5.5)
        c.setFillColor(GRAY)
        c.drawCentredString(gx + w / 2, gy - h - 8, " ".join(fret_str(f) for f in frets))
        c.setFillColor(black)

    def chord_block(self, shapes, names):
        per_row = 10
        cw = 70
        rows = (len(names) + per_row - 1) // per_row
        self.need(rows * 86)
        for i, n in enumerate(names):
            r, col = divmod(i, per_row)
            self.chord_diagram(MARGIN + col * cw, self.y - r * 84, n, shapes[n])
        self.y -= rows * 84 + 4

    # ---- tab system ----------------------------------------------------
    def tab_system(self, bars, shapes, pattern, first_chords_shown=None):
        """bars: list of bar dicts resolved to events: {"chords":[(slot,name)], "notes":[(slot,string,fret,annot)]}"""
        self.need(SYSTEM_H)
        c = self.c
        top = self.y - 14
        x0 = MARGIN + 14
        # string names
        c.setFont("Helvetica", 6)
        c.setFillColor(GRAY)
        for s in range(6):
            yy = top - (5 - s) * LINE_GAP
            c.drawRightString(x0 - 3, yy - 2, STRING_NAMES[s])
        c.setFillColor(black)
        for s in range(6):
            yy = top - (5 - s) * LINE_GAP
            c.setStrokeColor(LIGHT)
            c.setLineWidth(0.5)
            c.line(x0, yy, x0 + BAR_W * len(bars), yy)
        c.setStrokeColor(black)
        c.setLineWidth(0.8)
        c.line(x0, top, x0, top - 5 * LINE_GAP)
        for bi, bar in enumerate(bars):
            bx = x0 + bi * BAR_W
            if self.record:
                self.boxes.append([self.page, round(bx, 1), round(top - 5 * LINE_GAP - 20, 1), round(BAR_W, 1), round(5 * LINE_GAP + 36, 1)])
            c.setStrokeColor(black)
            c.setLineWidth(0.8)
            c.line(bx + BAR_W, top, bx + BAR_W, top - 5 * LINE_GAP)
            # beat ticks
            c.setFont("Helvetica", 5.5)
            c.setFillColor(LIGHT)
            for b in range(4):
                xx = bx + 3 + b * 4 * SLOT_W + SLOT_W / 2
                c.drawCentredString(xx, top - 5 * LINE_GAP - 8, str(b + 1))
                for sub, lab in ((1, "e"), (2, "&"), (3, "a")):
                    c.drawCentredString(xx + sub * SLOT_W, top - 5 * LINE_GAP - 8, lab)
            c.setFillColor(black)
            # chord names
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(BLUE)
            for slot, name in bar["chords"]:
                c.drawString(bx + 3 + slot * SLOT_W, top + 4, name)
            c.setFillColor(black)
            if bar.get("label"):
                c.setFont("Helvetica-Oblique", 6.5)
                c.setFillColor(RED)
                from reportlab.pdfbase.pdfmetrics import stringWidth
                lx = bx + 3 + (stringWidth(bar["chords"][0][1], "Helvetica-Bold", 8) + 6 if bar["chords"] else 0)
                c.drawString(lx, top + 4, bar["label"])
                c.setFillColor(black)
            # notes
            annots = {}
            for slot, string, fret, annot in bar["notes"]:
                xx = bx + 3 + slot * SLOT_W + SLOT_W / 2
                yy = top - (5 - string) * LINE_GAP
                txt = fret_str(fret)
                c.setFont("Helvetica", 7)
                from reportlab.pdfbase.pdfmetrics import stringWidth
                tw = stringWidth(txt, "Helvetica", 7)
                c.setFillColor(white)
                c.rect(xx - tw / 2 - 0.8, yy - 2.6, tw + 1.6, 6.8, stroke=0, fill=1)
                c.setFillColor(black)
                c.drawCentredString(xx, yy - 2.2, txt)
                if annot and annot not in annots.get(slot, ""):
                    annots[slot] = (annots[slot] + " " + annot) if slot in annots else annot
            c.setFont("Helvetica", 5.5)
            c.setFillColor(GRAY)
            for slot, a in annots.items():
                xx = bx + 3 + slot * SLOT_W + SLOT_W / 2
                c.drawCentredString(xx, top - 5 * LINE_GAP - 16, a)
            c.setFillColor(black)
        self.y = top - 5 * LINE_GAP - 26


def resolve_bar(bar, shapes, pattern):
    """Turn a spec bar into drawable events."""
    if isinstance(bar, dict) and "riff" in bar:
        notes = [(s, st, fr, None) for s, st, fr in bar["riff"]]
        chords = [(0, bar.get("chord", ""))] if bar.get("chord") else []
        return {"chords": chords, "notes": notes, "label": bar.get("label")}
    if isinstance(bar, dict):
        chords_list = bar["chords"]
        label = bar.get("label")
        pat = bar.get("pattern", pattern)
    else:
        chords_list = bar
        label = None
        pat = pattern
    n = len(chords_list)
    span = 16 // n
    chords = [(i * span, ch) for i, ch in enumerate(chords_list)]
    notes = []
    if pat is None:
        return {"chords": chords, "notes": [], "label": label}
    for ev in pat["events"]:
        slot, strings, annot = ev[0], ev[1], (ev[2] if len(ev) > 2 else None)
        ch = chords_list[min(slot // span, n - 1)]
        if ch in ("", "-", "N.C."):
            continue
        shape = shapes[ch]
        frets = shape["frets"]
        if strings == "all":
            idx = [i for i, f in enumerate(frets) if f not in ("x", None)]
        elif strings == "bass":
            idx = [next(i for i, f in enumerate(frets) if f not in ("x", None))]
        elif strings == "top2":
            idx = [i for i, f in enumerate(frets) if f not in ("x", None)][-2:]
        elif strings == "top3":
            idx = [i for i, f in enumerate(frets) if f not in ("x", None)][-3:]
        elif strings == "top4":
            idx = [i for i, f in enumerate(frets) if f not in ("x", None)][-4:]
        else:
            idx = []
            if isinstance(strings, str):
                strings = [strings]
            for s in strings:
                if isinstance(s, str) and s.startswith("b"):   # b0 = lowest sounding, b1 = next ...
                    sounding = [i for i, f in enumerate(frets) if f not in ("x", None)]
                    k = int(s[1:])
                    if k < len(sounding):
                        idx.append(sounding[k])
                elif isinstance(s, str) and s.startswith("t"):  # t0 = highest sounding, t1 = next lower
                    sounding = [i for i, f in enumerate(frets) if f not in ("x", None)]
                    k = int(s[1:])
                    if k < len(sounding):
                        idx.append(sounding[-1 - k])
                elif frets[s] not in ("x", None):
                    idx.append(s)
        for i in idx:
            notes.append((slot, i, frets[i], annot))
    return {"chords": chords, "notes": notes, "label": label}


def render(spec, out, mode):
    shapes = spec["shapes_played"] if mode == "played" else spec["shapes_movable"]
    sub = "Tab 1 - as played on the record" if mode == "played" else "Tab 2 - movable mid-neck shapes (transposable)"
    d = Doc(out, f"{spec['title']} - {sub}")
    d.text(spec["title"], 16, font="Helvetica-Bold", dy=20)
    d.text(sub, 10.5, font="Helvetica-Oblique", color=GRAY, dy=14)
    meta = f"Key: {spec['key']}    Tempo: {spec['tempo']}    Time: {spec.get('time','4/4')}    Tuning: {spec.get('tuning','standard E A D G B e')}    Source: {spec.get('source','')}"
    d.wrapped(meta, 8.5)
    for n in spec.get("notes", []):
        d.wrapped("- " + n, 8)
    if mode == "played":
        for n in spec.get("notes_played", []):
            d.wrapped("- " + n, 8)
    if mode == "movable":
        for n in spec.get("notes_movable", []):
            d.wrapped("- " + n, 8)
        d.space(2)
        d.text("Transposing: every shape here is movable (no open strings). Shift ALL shapes by the same number of frets:", 8, font="Helvetica-Bold", dy=11)
        d.wrapped(spec.get("transpose_table", ""), 8)
    d.space(4)
    d.text("Chord shapes used (numbers in the dots = fretting-hand finger: 1 index, 2 middle, 3 ring, 4 pinky; barre = finger 1 across)", 8.5, font="Helvetica-Bold", dy=11)
    used = []
    for sec in spec["sections"]:
        for bar in sec["bars"]:
            if isinstance(bar, dict) and "riff" in bar:
                if bar.get("chord") and bar["chord"] not in used and bar["chord"] in shapes:
                    used.append(bar["chord"])
                continue
            chs = bar["chords"] if isinstance(bar, dict) else bar
            for ch in chs:
                if ch in shapes and ch not in used:
                    used.append(ch)
    d.chord_block(shapes, used)
    # pattern legend
    d.text("Picking / strumming patterns (right hand: p thumb, i index, m middle, a ring; D down-strum, U up-strum; let chords ring unless marked)", 8.5, font="Helvetica-Bold", dy=11)
    for pname, pat in spec["patterns"].items():
        d.need(SYSTEM_H + 24)
        d.wrapped(f"{pname}: {pat['desc']}", 8, color=GRAY)
        demo_chord = pat.get("demo", used[0])
        bar = resolve_bar([demo_chord], shapes, pat)
        bar["label"] = None
        d.tab_system([bar], shapes, pat)
    d.record = True
    for sec in spec["sections"]:
        d.space(4)
        d.need(SYSTEM_H + 30)
        d.text(sec["name"], 11, font="Helvetica-Bold", dy=13)
        if sec.get("note"):
            d.wrapped(sec["note"], 8, color=GRAY)
        pat = spec["patterns"].get(sec.get("pattern")) if sec.get("pattern") else None
        bars = [resolve_bar(b, shapes, pat) for b in sec["bars"]]
        for i in range(0, len(bars), BARS_PER_LINE):
            d.tab_system(bars[i:i + BARS_PER_LINE], shapes, pat)
    d.footer()
    d.c.setSubject(json.dumps({"tabplayer": 1, "song": spec.get("id"), "mode": mode, "page": [PAGE_W, PAGE_H], "bars": d.boxes}, separators=(",", ":")))
    d.c.save()


if __name__ == "__main__":
    spec = json.load(open(sys.argv[1]))
    render(spec, sys.argv[2], sys.argv[3])
    print("wrote", sys.argv[2])
