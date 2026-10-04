"""Merge the shared shape library into a song spec and render both PDFs.
usage: build.py spec.json "Output base name"
"""
import json, sys, os
from tabgen import render

X = "x"
# frets low E -> high e, fingers likewise (0 = open, X = muted)
PLAYED = {
    "F":     ([1, 3, 3, 2, 1, 1], [1, 3, 4, 2, 1, 1]),
    "Dm":    ([X, X, 0, 2, 3, 1], [X, X, 0, 2, 3, 1]),
    "Bb":    ([X, 1, 3, 3, 3, 1], [X, 1, 2, 3, 4, 1]),
    "C":     ([X, 3, 2, 0, 1, 0], [X, 3, 2, 0, 1, 0]),
    "Csus4": ([X, 3, 3, 0, 1, 1], [X, 3, 4, 0, 1, 1]),
    "C/E":   ([0, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0]),
    "Gm":    ([3, 5, 5, 3, 3, 3], [1, 3, 4, 1, 1, 1]),
    "F/A":   ([X, 0, 3, 2, 1, 1], [X, 0, 3, 2, 1, 1]),
    "F/C":   ([X, 3, 3, 2, 1, 1], [X, 3, 4, 2, 1, 1]),
    "Am":    ([X, 0, 2, 2, 1, 0], [X, 0, 2, 3, 1, 0]),
    "A":     ([X, 0, 2, 2, 2, 0], [X, 0, 1, 2, 3, 0]),
    "A7":    ([X, 0, 2, 0, 2, 0], [X, 0, 2, 0, 3, 0]),
    "D/A":   ([X, 0, 0, 2, 3, 2], [X, 0, 0, 1, 3, 2]),
    "E/A":   ([X, 0, 2, 1, 0, 0], [X, 0, 2, 1, 0, 0]),
    "Asus2": ([X, 0, 2, 2, 0, 0], [X, 0, 1, 2, 0, 0]),
    "A/C#":  ([X, 4, 2, 2, 2, 0], [X, 3, 1, 1, 1, 0]),
    "A/E":   ([0, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0]),
    "D":     ([X, X, 0, 2, 3, 2], [X, X, 0, 1, 3, 2]),
    "E":     ([0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0]),
    "Em":    ([0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0]),
    "F#m":   ([2, 4, 4, 2, 2, 2], [1, 3, 4, 1, 1, 1]),
    "Bm":    ([X, 2, 4, 4, 3, 2], [X, 1, 3, 4, 2, 1]),
    "B":     ([X, 2, 4, 4, 4, 2], [X, 1, 2, 3, 4, 1]),
    "C#m":   ([X, 4, 6, 6, 5, 4], [X, 1, 3, 4, 2, 1]),
    "G#m":   ([4, 6, 6, 4, 4, 4], [1, 3, 4, 1, 1, 1]),
    "F#":    ([2, 4, 4, 3, 2, 2], [1, 3, 4, 2, 1, 1]),
    "C#":    ([X, 4, 6, 6, 6, 4], [X, 1, 2, 3, 4, 1]),
    "Fm":    ([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1]),
    "Db":    ([X, 4, 6, 6, 6, 4], [X, 1, 2, 3, 4, 1]),
    "Ab":    ([4, 6, 6, 5, 4, 4], [1, 3, 4, 2, 1, 1]),
    "Eb":    ([X, X, 1, 3, 4, 3], [X, X, 1, 2, 4, 3]),
    "Eb/G":  ([3, X, 1, 3, 4, X], [2, X, 1, 3, 4, X]),
    "Bbm":   ([X, 1, 3, 3, 2, 1], [X, 1, 3, 4, 2, 1]),
    "Cm":    ([X, 3, 5, 5, 4, 3], [X, 1, 3, 4, 2, 1]),
    "Bb/D":  ([X, X, 0, 3, 3, 1], [X, X, 0, 2, 3, 1]),
    "Dm/A":  ([X, 0, 0, 2, 3, 1], [X, 0, 0, 2, 3, 1]),
    "Fmaj7": ([X, X, 3, 2, 1, 0], [X, X, 3, 2, 1, 0]),
    "Gm7":   ([3, 5, 3, 3, 3, 3], [1, 3, 1, 1, 1, 1]),
}
MOVABLE = {
    "F":     ([X, 8, 10, 10, 10, 8], [X, 1, 2, 3, 4, 1]),
    "Dm":    ([X, 5, 7, 7, 6, 5], [X, 1, 3, 4, 2, 1]),
    "Bb":    ([6, 8, 8, 7, 6, 6], [1, 3, 4, 2, 1, 1]),
    "C":     ([8, 10, 10, 9, 8, 8], [1, 3, 4, 2, 1, 1]),
    "Csus4": ([8, 10, 10, 10, 8, 8], [1, 2, 3, 4, 1, 1]),
    "C/E":   ([X, 7, 10, 9, 8, X], [X, 1, 4, 3, 2, X]),
    "Gm":    ([3, 5, 5, 3, 3, 3], [1, 3, 4, 1, 1, 1]),
    "F/A":   ([X, X, 7, 5, 6, 5], [X, X, 4, 1, 3, 2]),
    "F/C":   ([8, 8, 10, 10, 10, 8], [1, 1, 2, 3, 4, 1]),
    "Am":    ([5, 7, 7, 5, 5, 5], [1, 3, 4, 1, 1, 1]),
    "A":     ([5, 7, 7, 6, 5, 5], [1, 3, 4, 2, 1, 1]),
    "A7":    ([5, 7, 5, 6, 5, 5], [1, 3, 1, 2, 1, 1]),
    "D/A":   ([5, 5, 7, 7, 7, 5], [1, 1, 2, 3, 4, 1]),
    "E/A":   ([X, 7, 6, 4, 5, X], [X, 4, 3, 1, 2, X]),
    "Asus2": ([X, X, 7, 4, 5, 5], [X, X, 4, 1, 2, 3]),
    "A/C#":  ([X, 4, 7, 6, 5, X], [X, 1, 4, 3, 2, X]),
    "A/E":   ([X, 7, 7, 6, 5, 5], [X, 3, 4, 2, 1, 1]),
    "D":     ([X, 5, 7, 7, 7, 5], [X, 1, 2, 3, 4, 1]),
    "E":     ([X, 7, 9, 9, 9, 7], [X, 1, 2, 3, 4, 1]),
    "Em":    ([X, 7, 9, 9, 8, 7], [X, 1, 3, 4, 2, 1]),
    "F#m":   ([2, 4, 4, 2, 2, 2], [1, 3, 4, 1, 1, 1]),
    "Bm":    ([7, 9, 9, 7, 7, 7], [1, 3, 4, 1, 1, 1]),
    "B":     ([7, 9, 9, 8, 7, 7], [1, 3, 4, 2, 1, 1]),
    "C#m":   ([X, 4, 6, 6, 5, 4], [X, 1, 3, 4, 2, 1]),
    "G#m":   ([4, 6, 6, 4, 4, 4], [1, 3, 4, 1, 1, 1]),
    "F#":    ([2, 4, 4, 3, 2, 2], [1, 3, 4, 2, 1, 1]),
    "C#":    ([X, 4, 6, 6, 6, 4], [X, 1, 2, 3, 4, 1]),
    "Fm":    ([X, 8, 10, 10, 9, 8], [X, 1, 3, 4, 2, 1]),
    "Db":    ([X, 4, 6, 6, 6, 4], [X, 1, 2, 3, 4, 1]),
    "Ab":    ([4, 6, 6, 5, 4, 4], [1, 3, 4, 2, 1, 1]),
    "Eb":    ([X, 6, 8, 8, 8, 6], [X, 1, 2, 3, 4, 1]),
    "Eb/G":  ([X, X, 5, 3, 4, 3], [X, X, 4, 1, 3, 2]),
    "Bbm":   ([6, 8, 8, 6, 6, 6], [1, 3, 4, 1, 1, 1]),
    "Cm":    ([X, 3, 5, 5, 4, 3], [X, 1, 3, 4, 2, 1]),
    "Bb/D":  ([X, 5, 8, 7, 6, X], [X, 1, 4, 3, 2, X]),
    "Dm/A":  ([X, X, 7, 7, 6, 5], [X, X, 3, 4, 2, 1]),
    "Fmaj7": ([X, 8, 10, 9, 10, 8], [X, 1, 3, 2, 4, 1]),
    "Gm7":   ([3, 5, 3, 3, 3, 3], [1, 3, 1, 1, 1, 1]),
}
NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
ENH = {"Db": "C#", "D#": "Eb", "Gb": "F#", "G#": "Ab", "A#": "Bb"}


def transpose_table(key_root):
    r = NOTES.index(ENH.get(key_root, key_root))
    parts = []
    for shift in range(-5, 7):
        if shift == 0:
            continue
        k = NOTES[(r + shift) % 12]
        parts.append(f"{k}: {'+' if shift > 0 else ''}{shift} frets")
    return f"Original key root {key_root} (shapes as written).  " + ",  ".join(parts) + ".  (Shapes that would drop below fret 1 can be played 12 frets higher.)"


def lib(d, names):
    out = {}
    for n in names:
        if n not in d:
            raise SystemExit(f"missing shape for {n}")
        frets, fingers = d[n]
        out[n] = {"frets": frets, "fingers": [None if f in (0, X) else f for f in fingers]}
    return out


def main():
    spec = json.load(open(sys.argv[1]))
    base = sys.argv[2]
    names = []
    for sec in spec["sections"]:
        for bar in sec["bars"]:
            chs = [bar.get("chord")] if isinstance(bar, dict) and "riff" in bar else (bar["chords"] if isinstance(bar, dict) else bar)
            for ch in chs:
                if ch and ch not in ("-", "N.C.") and ch not in names:
                    names.append(ch)
    for pat in spec["patterns"].values():
        if pat.get("demo") and pat["demo"] not in names:
            names.append(pat["demo"])
    spec["shapes_played"] = lib(PLAYED, names)
    spec["shapes_movable"] = lib(MOVABLE, names)
    spec.setdefault("transpose_table", transpose_table(spec["key_root"]))
    outdir = "/Users/mathias/my-documents/music"
    p1 = os.path.join(outdir, f"{base} - Tab 1 (as played).pdf")
    p2 = os.path.join(outdir, f"{base} - Tab 2 (movable mid-neck shapes).pdf")
    render(spec, p1, "played")
    render(spec, p2, "movable")


if __name__ == "__main__":
    main()
