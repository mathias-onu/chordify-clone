# Tab Player

Run `./serve.sh` and open http://localhost:8765/. It starts `serve.py`, a stdlib static server with HTTP Range support; plain `python3 -m http.server` cannot seek inside the mp3s, and `file://` cannot fetch `data/songs.json`.

Keys: Space play/pause, Left/Right ±5s, Shift+Left/Right previous/next section, L loop section, M switch tab version, A autoscroll.
Click a section header or a bar to jump there. Scrolling by hand while playing turns autoscroll off.
