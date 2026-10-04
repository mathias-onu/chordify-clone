"""Export songs.json for the tab player: every bar gets absolute start/end seconds.
Section start = '(m:ss)' in the section name, snapped to the nearest tracked beat.
Bars inside a section are spaced evenly between that start and the next section's start."""
import json, re, bisect
import numpy as np
from build import PLAYED, MOVABLE, lib
from tabgen import resolve_bar

SONGS = [
    ("spec01.json", "01-voi-canta-bunatatea-ta", "Voi cânta bunătatea Ta Revive.mp3", "voi-canta"),
    ("spec02.json", "02-sa-nalt-jertfa-ta", "Să-nalț jertfa Ta, Isuse BBSO.mp3", "sa-nalt"),
    ("spec03.json", "03-lords-prayer", "The Lord's Prayer (It's Yours) Matt Maher.mp3", "lords-prayer"),
    ("spec04.json", "04-christus-victor", "Christus Victor (Amen) Getty.mp3", "christus-victor"),
    ("spec05.json", "05-vino-cu-noi", "Vino cu noi HYChoir.mp3", "vino-cu-noi"),
]

def section_start(name):
    m = re.search(r"\((\d+):(\d\d)\)", name)
    return int(m.group(1)) * 60 + int(m.group(2))

def snap(t, beats):
    i = bisect.bisect_left(beats, t)
    cands = [beats[j] for j in (i - 1, i) if 0 <= j < len(beats)]
    return min(cands, key=lambda b: abs(b - t))

out = []
for spec_file, stem, audio, sid in SONGS:
    spec = json.load(open(spec_file))
    played = dict(PLAYED, **{k: tuple(v) for k, v in spec.get("shapes_played_override", {}).items()})
    movable = dict(MOVABLE, **{k: tuple(v) for k, v in spec.get("shapes_movable_override", {}).items()})
    chart = json.load(open(f"{stem}_chart.json"))
    beats = chart["beat_times"]
    bpm = float(re.match(r"[\d.]+", spec["tempo"]).group())
    barlen = 240.0 / bpm
    names = []
    for sec in spec["sections"]:
        for bar in sec["bars"]:
            chs = [bar.get("chord")] if isinstance(bar, dict) and "riff" in bar else (bar["chords"] if isinstance(bar, dict) else bar)
            names += [c for c in chs if c and c not in names]
    for pat in spec["patterns"].values():
        if pat.get("demo") and pat["demo"] not in names:
            names.append(pat["demo"])
    shapes = {"played": lib(played, names), "movable": lib(movable, names)}
    starts = [snap(section_start(s["name"]), beats) for s in spec["sections"]]
    duration = beats[-1] + barlen
    sections = []
    for si, sec in enumerate(spec["sections"]):
        t0 = starts[si]
        n = len(sec["bars"])
        t_end = starts[si + 1] if si + 1 < len(starts) else min(duration, t0 + n * barlen)
        if t_end <= t0:
            t_end = t0 + n * barlen
        bl = (t_end - t0) / n
        if abs(bl - barlen) / barlen > 0.15:
            print(f"warn {sid} '{sec['name']}': bar length {bl:.2f}s vs tempo {barlen:.2f}s")
        pat = spec["patterns"].get(sec["pattern"]) if sec.get("pattern") else None
        bars = []
        for bi, bar in enumerate(sec["bars"]):
            r = {m: resolve_bar(bar, shapes[m], pat) for m in ("played", "movable")}
            bars.append({
                "t0": round(t0 + bi * bl, 3), "t1": round(t0 + (bi + 1) * bl, 3),
                "chords": [{"slot": s, "name": c} for s, c in r["played"]["chords"]],
                "label": r["played"].get("label"),
                "notes": {m: [{"slot": s, "string": st, "fret": f, "annot": a} for s, st, f, a in r[m]["notes"]] for m in r},
            })
        sections.append({"name": sec["name"], "note": sec.get("note", ""), "pattern": sec.get("pattern"), "t0": bars[0]["t0"], "t1": bars[-1]["t1"], "bars": bars})
    out.append({
        "id": sid, "title": spec["title"], "key": spec["key"], "tempo": spec["tempo"], "time": spec.get("time", "4/4"),
        "audio": "audio/" + audio, "audio_noguitar": "audio/noguitar/" + audio,
        "pdf": {"played": f"../{spec['title'].split(' (')[0].split(' - ')[0]} - Tab 1 (as played).pdf"}, "duration": round(duration, 2), "notes": spec.get("notes", []), "notes_movable": spec.get("notes_movable", []),
        "transpose_table": spec.get("transpose_table", ""), "shapes": shapes,
        "patterns": {k: {"desc": v["desc"]} for k, v in spec["patterns"].items()}, "sections": sections,
    })
    print(sid, len(sections), "sections", sum(len(s["bars"]) for s in sections), "bars", "duration", round(duration, 1))
json.dump(out, open("/Users/mathias/my-documents/music/tabplayer/data/songs.json", "w"), ensure_ascii=False)
print("wrote songs.json")
