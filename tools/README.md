# Tab sources

`spec0N.json` are the hand-checked song charts (sections, bars, chords, picking patterns).
`*_chart.json` hold the beat grid tracked from each recording.

- `python3 build.py spec01.json "Voi cânta bunătatea Ta"` writes the two PDFs into the music folder.
- `python3 export_songs.py` writes `../data/songs.json` for the player.

Both need `reportlab` (`pip install reportlab`).
