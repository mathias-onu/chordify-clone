# Tab Player

Run `./serve.sh` and open http://localhost:8765/. It starts `serve.py`, a stdlib static server with HTTP Range support; plain `python3 -m http.server` cannot seek inside the mp3s, and `file://` cannot fetch `data/songs.json`.

Keys: Space play/pause, Left/Right ±5s, Shift+Left/Right previous/next section, L loop section, M switch tab version, A autoscroll, G guitar on/off, T sync to now (PDF Sync panel).
Click a section header or a bar to jump there. Scrolling by hand while playing turns autoscroll off.
The Guitar button switches between the full mix and the track without guitar. It is disabled when a song has no guitar-free track.

## Opening a PDF

Drop a tab PDF anywhere on the window, or use Open PDF + audio at the top of the song list. You can drop the PDF and its mp3 together or one after the other.

PDFs exported by this project carry their bar map in the document metadata. The player highlights each bar on the page and uses the song's own audio and sections. A dropped mp3 replaces that audio.

Any other PDF opens with the Sync panel. The player splits each page into equal lines and follows the audio line by line. Drop the mp3 for the PDF to play it.

Sync fields:

- BPM is the tempo of the recording.
- Beats per bar and Bars per line set how long one line lasts.
- Lines per page is the number of tab lines on each page, counted from the top.
- First bar is the time in seconds where the first line starts. Set to now (or T) copies the current playback time into it.

To time each line by hand, press Tap lines, play the song, and press T at the start of each line. Lines after the last tap continue at the BPM. Clear taps removes them. The player saves the Sync settings per file and restores them when you open the same file again.

After a fresh clone run `vendor/fetch.sh` once to download pdf.js; the `audio/` folder is not in git either, copy the mp3s there (see `audio_noguitar` paths in `data/songs.json`).
