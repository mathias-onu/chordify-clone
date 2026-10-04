const SLOTS = 16;
const BEATS = ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];
const MODES = ['played', 'movable'];
const THEMES = ['light', 'dark'];
const SONG_SOURCE = { kind: 'song' };
const DEFAULT_SYNC = { bpm: 120, beatsPerBar: 4, barsPerLine: 4, linesPerPage: 6, firstBarTime: 0, taps: [], tapping: false };
const SYNC_FIELDS = [
  { id: 'sync-bpm', key: 'bpm', min: 20, int: false },
  { id: 'sync-beats', key: 'beatsPerBar', min: 1, int: true },
  { id: 'sync-bars', key: 'barsPerLine', min: 1, int: true },
  { id: 'sync-lines', key: 'linesPerPage', min: 1, int: true },
  { id: 'sync-first', key: 'firstBarTime', min: 0, int: false },
];
const MISMATCH = 'Bar map does not match song data; using Sync panel.';
const NEEDS_AUDIO = 'Drop the mp3 for this PDF to play it.';
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 4.5h4.5v15H6zM13.5 4.5H18v15h-4.5z" fill="currentColor"/></svg>';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function chordSvg(shape) {
  const { frets, fingers } = shape;
  const fretted = frets.filter((f) => typeof f === 'number' && f > 0);
  const base = fretted.length && Math.max(...fretted) > 4 ? Math.min(...fretted) : 1;
  const L = 24, T = 16, SX = 10, FY = 13, W = L + 5 * SX + 8, H = T + 5 * FY + 4;
  const x = (s) => L + s * SX;
  const y = (f) => T + (f - base + 0.5) * FY;
  const parts = [];
  for (let s = 0; s < 6; s++) parts.push(`<line x1="${x(s)}" y1="${T}" x2="${x(s)}" y2="${T + 5 * FY}"/>`);
  for (let f = 0; f <= 5; f++) parts.push(`<line x1="${x(0)}" y1="${T + f * FY}" x2="${x(5)}" y2="${T + f * FY}"/>`);
  if (base === 1) parts.push(`<rect class="nut" x="${x(0) - 0.5}" y="${T - 3}" width="${5 * SX + 1}" height="3"/>`);
  else parts.push(`<text class="base" x="${L - 5}" y="${y(base) + 3.5}" text-anchor="end">${base}fr</text>`);
  const barres = new Map();
  frets.forEach((f, s) => {
    const finger = fingers[s];
    if (typeof f !== 'number' || f <= 0 || finger == null) return;
    const key = `${finger}:${f}`;
    const b = barres.get(key) || { f, from: s, to: s, n: 0 };
    b.to = s;
    b.n++;
    barres.set(key, b);
  });
  for (const b of barres.values()) {
    if (b.n > 1) parts.push(`<rect class="dot" x="${x(b.from) - 4.5}" y="${y(b.f) - 4.5}" width="${x(b.to) - x(b.from) + 9}" height="9" rx="4.5"/>`);
  }
  frets.forEach((f, s) => {
    if (f === 'x') parts.push(`<text class="mark" x="${x(s)}" y="${T - 6}" text-anchor="middle">×</text>`);
    else if (f === 0) parts.push(`<circle class="open" cx="${x(s)}" cy="${T - 8}" r="3"/>`);
    else if (typeof f === 'number') {
      parts.push(`<circle class="dot" cx="${x(s)}" cy="${y(f)}" r="4.5"/>`);
      if (fingers[s] != null) parts.push(`<text class="finger" x="${x(s)}" y="${y(f) + 2.5}" text-anchor="middle">${fingers[s]}</text>`);
    }
  });
  return `<svg class="diagram" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${parts.join('')}</svg>`;
}

function chordsUsed(song) {
  const names = [];
  for (const section of song.sections) {
    for (const bar of section.bars) {
      for (const c of bar.chords) if (!names.includes(c.name)) names.push(c.name);
    }
  }
  return names;
}

function barHtml(bar, mode, index) {
  const notes = bar.notes[mode];
  const chords = bar.chords
    .map((c) => `<span class="chord" style="grid-column:${c.slot + 1}">${esc(c.name)}</span>`)
    .join('');
  const label = bar.label ? `<span class="tag">${esc(bar.label)}</span>` : '';
  const beats = BEATS.map((b, i) => `<span${i % 4 ? '' : ' class="beat"'}>${b}</span>`).join('');
  let staff = '<div class="staff empty"></div>';
  let annots = '';
  if (notes.length) {
    const lines = [0, 1, 2, 3, 4, 5].map((r) => `<i class="line" style="grid-row:${r + 1}"></i>`).join('');
    const frets = notes
      .map((n) => `<span class="fret" style="grid-area:${6 - n.string}/${n.slot + 1}">${esc(n.fret)}</span>`)
      .join('');
    staff = `<div class="staff">${lines}${frets}</div>`;
    const bySlot = new Map();
    for (const n of notes) if (n.annot && !bySlot.has(n.slot)) bySlot.set(n.slot, n.annot);
    annots = [...bySlot]
      .map(([slot, a]) => `<span style="grid-column:${slot + 1}">${esc(a)}</span>`)
      .join('');
  }
  return `<div class="bar${notes.length ? '' : ' tacet'}" data-index="${index}">${label}<div class="cols">` +
    `<div class="chords">${chords}</div>${staff}<div class="annots">${annots}</div><div class="beats">${beats}</div>` +
    `</div></div>`;
}

function sectionHtml(section, song, index) {
  const pattern = section.pattern
    ? `<p class="pattern"><b>${esc(section.pattern)}</b> ${esc(song.patterns[section.pattern]?.desc)}</p>`
    : '';
  const note = section.note ? `<p class="section-note">${esc(section.note)}</p>` : '';
  return `<div class="section-head" data-index="${index}"><h2>${esc(section.name)}</h2>${note}${pattern}</div>`;
}

function tabHtml(song, mode) {
  let k = 0;
  return song.sections
    .map((section, i) => {
      const bars = section.bars.map((bar) => barHtml(bar, mode, k++)).join('');
      return `<section class="section">${sectionHtml(section, song, i)}<div class="bars">${bars}</div></section>`;
    })
    .join('');
}

function notesHtml(song, mode) {
  const list = (items) => (items.length ? `<ul>${items.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '');
  if (mode !== 'movable') return list(song.notes);
  const table = song.transpose_table ? `<pre>${esc(song.transpose_table)}</pre>` : '';
  return list(song.notes) + list(song.notes_movable) + table;
}

function shapesHtml(song, mode) {
  return chordsUsed(song)
    .map((name) => `<figure class="shape"><figcaption>${esc(name)}</figcaption>${chordSvg(song.shapes[mode][name])}</figure>`)
    .join('');
}

function findLast(items, t) {
  let lo = 0, hi = items.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].t0 <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

const isPdf = (state) => state.source.kind === 'pdf';
const ourPdf = (state) => isPdf(state) && Boolean(state.source.song);
const foreignPdf = (state) => isPdf(state) && !state.source.song;

function tracks(state, song) {
  if (!isPdf(state)) return { on: song.audio, off: song.audio_noguitar ?? null };
  if (state.audioFile) return { on: state.audioFile.url, off: null };
  if (ourPdf(state)) return { on: song.audio, off: song.audio_noguitar ?? null };
  return { on: null, off: null };
}

const flatBars = (song) =>
  song.sections.flatMap((s, sectionIndex) => s.bars.map((bar, barIndex) => ({ t0: bar.t0, t1: bar.t1, sectionIndex, barIndex })));

const lineLength = (sync) => (sync.barsPerLine * sync.beatsPerBar * 60) / sync.bpm;

function lineStarts(sync, lineCount) {
  const len = lineLength(sync);
  const { taps } = sync;
  const last = taps.length - 1;
  return Array.from({ length: lineCount }, (_, i) => {
    if (!taps.length) return sync.firstBarTime + i * len;
    return i <= last ? taps[i] : taps[last] + (i - last) * len;
  });
}

const boxRect = ([, x, y, w, h], [W, H]) => [(x / W) * 100, ((H - y - h) / H) * 100, (w / W) * 100, (h / H) * 100];
const lineRect = (i, perPage) => [0, ((i % perPage) / perPage) * 100, 100, 100 / perPage];

function parseMeta(subject) {
  try { return JSON.parse(subject); } catch { return null; }
}

function pdfSource(file, pages, meta, songs) {
  const song = meta?.tabplayer === 1 ? songs.find((s) => s.id === meta.song) : null;
  const ours = Boolean(song) && Array.isArray(meta.bars) && meta.bars.length === flatBars(song).length;
  return {
    kind: 'pdf', name: file.name, size: file.size, pages,
    song: ours ? song.id : null,
    mode: ours ? meta.mode ?? null : null,
    boxes: ours ? meta.bars : null,
    page: ours ? meta.page : null,
    mismatch: meta?.tabplayer === 1 && !ours,
  };
}

const syncKey = (source) => `tabplayer.sync.${source.name}:${source.size}`;
const validSync = (field, v) => Number.isFinite(v) && v >= field.min && (!field.int || Number.isInteger(v));
const isPdfFile = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isAudioFile = (f) => f.type.startsWith('audio/') || /\.(mp3|m4a|wav)$/i.test(f.name);

function fmtTap(t) {
  const tenths = Math.round(t * 10);
  return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
}

const $ = (id) => document.getElementById(id);
const ui = {
  songs: $('songs'), main: $('main'), title: $('title'), meta: $('meta'), notes: $('notes'),
  shapes: $('shapes'), tab: $('tab'), pages: $('pages'), play: $('play'), loop: $('loop'), rate: $('rate'),
  seek: $('seek'), time: $('time'), autoscroll: $('autoscroll'), guitar: $('guitar'),
  fileInput: $('file-input'), sync: $('sync'), syncTap: $('sync-tap'), syncTaps: $('sync-taps'), notice: $('notice'),
  navTitle: $('nav-title'), theme: $('theme'),
  modeGroup: document.querySelector('.mode'), notesBox: document.querySelector('.notes'),
  modeButtons: [...document.querySelectorAll('[data-mode]')],
};
const cursor = Object.assign(document.createElement('div'), { className: 'cursor' });

function setSrc(el, url) {
  if (url) el.src = url.startsWith('blob:') ? url : encodeURI(url);
  else {
    el.removeAttribute('src');
    el.load();
  }
}

const deck = {
  full: $('audio'),
  bed: $('audio-noguitar'),
  audible: $('audio'),
  tracks: { on: null, off: null },
  get silent() { return this.audible === this.full ? this.bed : this.full; },
  load(tracks) {
    if (tracks.on === this.tracks.on && tracks.off === this.tracks.off) return;
    this.tracks = tracks;
    setSrc(this.full, tracks.on);
    setSrc(this.bed, tracks.off);
  },
  setGuitar(guitar) {
    const next = guitar || !this.tracks.off ? this.full : this.bed;
    if (next !== this.audible) {
      next.currentTime = this.audible.currentTime;
      if (!this.audible.paused) next.play();
      this.audible = next;
    }
    this.full.muted = this.audible !== this.full;
    this.bed.muted = this.audible !== this.bed;
  },
  play() {
    if (!this.tracks.on) return;
    this.full.play();
    if (this.tracks.off) this.bed.play();
  },
  pause() {
    this.full.pause();
    this.bed.pause();
  },
  seek(t) {
    this.full.currentTime = t;
    if (this.tracks.off) this.bed.currentTime = t;
  },
  setRate(r) {
    for (const el of [this.full, this.bed]) {
      el.playbackRate = r;
      el.defaultPlaybackRate = r;
    }
  },
  resync() {
    const { silent, audible } = this;
    if (this.tracks.off && !silent.seeking && Math.abs(silent.currentTime - audible.currentTime) > 0.08) {
      silent.currentTime = audible.currentTime;
    }
  },
};

let songs = [];
let song = null;
let pdfDoc = null;
let pdfjsReady = null;
let opening = Promise.resolve();
let bars = [];
let sections = [];
let live = { bar: -1, slot: -1, chord: null, time: '' };
let state = {
  source: SONG_SOURCE, songId: null, mode: 'played', theme: 'light', guitar: true, loopSection: null, autoscroll: true, rate: 1,
  audioFile: null, sync: DEFAULT_SYNC,
};

function store(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function recallSync(source) {
  let saved = null;
  try { saved = JSON.parse(recall(syncKey(source))); } catch {}
  return { ...DEFAULT_SYNC, ...saved, tapping: false };
}

const duration = () => (isFinite(deck.audible.duration) ? deck.audible.duration : (song?.duration ?? 0));

function setState(patch) {
  const prev = state;
  state = { ...state, ...patch };
  song = songs.find((s) => s.id === (isPdf(state) ? state.source.song : state.songId)) ?? null;
  store('tabplayer.songId', state.songId);
  store('tabplayer.mode', state.mode);
  store('tabplayer.theme', state.theme);
  store('tabplayer.guitar', state.guitar ? 'on' : 'off');
  const sourceChanged = state.source !== prev.source || state.songId !== prev.songId;
  if (sourceChanged) renderSource();
  else if (state.mode !== prev.mode && !isPdf(state)) renderSong();
  if (sourceChanged || state.audioFile !== prev.audioFile) deck.load(tracks(state, song));
  if (isPdf(state) && (sourceChanged || state.sync !== prev.sync)) renderOverlays();
  if (foreignPdf(state)) {
    if (state.sync !== prev.sync) store(syncKey(state.source), JSON.stringify(state.sync));
    renderSync();
  }
  if (state.autoscroll && !prev.autoscroll && live.bar >= 0) scrollToBar(live.bar);
  renderControls();
}

function resetLive() {
  cursor.remove();
  live = { bar: -1, slot: -1, chord: null, time: '' };
}

function renderSource() {
  const pdf = isPdf(state);
  ui.tab.hidden = pdf;
  ui.pages.hidden = !pdf;
  ui.sync.hidden = !foreignPdf(state);
  ui.modeGroup.hidden = pdf;
  ui.notesBox.hidden = pdf;
  ui.shapes.hidden = pdf;
  for (const el of ui.songs.querySelectorAll('.song')) el.classList.toggle('active', !pdf && songs[el.dataset.index] === song);
  if (pdf) renderPdfHead();
  else renderSong();
}

function setTitle(text) {
  ui.title.textContent = text;
  ui.navTitle.textContent = text;
  document.title = `${text} · Fretline`;
}

function renderSong() {
  setTitle(song.title);
  ui.meta.textContent = `${song.key} · ${song.tempo} · ${song.time}`;
  ui.notes.innerHTML = notesHtml(song, state.mode);
  ui.shapes.innerHTML = shapesHtml(song, state.mode);
  ui.tab.innerHTML = tabHtml(song, state.mode);
  const barEls = ui.tab.querySelectorAll('.bar');
  const headEls = ui.tab.querySelectorAll('.section-head');
  bars = [];
  sections = song.sections.map((s, sectionIndex) => {
    s.bars.forEach((bar, barIndex) => {
      const el = barEls[bars.length];
      const chords = [...el.querySelectorAll('.chord')].map((c, i) => ({ slot: bar.chords[i].slot, el: c }));
      bars.push({ t0: bar.t0, t1: bar.t1, sectionIndex, barIndex, el, cols: el.querySelector('.cols'), chords });
    });
    return { t0: s.t0, t1: s.t1, el: headEls[sectionIndex] };
  });
  resetLive();
}

function renderPdfHead() {
  const { source } = state;
  const modeLabel = song && ui.modeButtons.find((b) => b.dataset.mode === source.mode)?.textContent;
  setTitle(song ? song.title : source.name);
  ui.meta.textContent = [modeLabel, 'PDF', `${source.pages} page${source.pages === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
}

function overlayEl(className, index, [left, top, width, height]) {
  const el = document.createElement('div');
  el.className = className;
  el.dataset.index = index;
  Object.assign(el.style, { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
  return el;
}

function renderOverlays() {
  for (const el of ui.pages.querySelectorAll('.pdf-bar')) el.remove();
  resetLive();
  bars = [];
  sections = [];
  const pageEls = ui.pages.children;
  const { source, sync } = state;
  if (pageEls.length < source.pages) return;
  if (ourPdf(state)) {
    bars = flatBars(song).map((bar, i) => {
      const box = source.boxes[i];
      const el = pageEls[box[0] - 1].appendChild(overlayEl('pdf-bar', i, boxRect(box, source.page)));
      return { ...bar, el, cols: el, chords: [] };
    });
    sections = song.sections.map((s) => ({ t0: s.t0, t1: s.t1, el: null }));
    return;
  }
  const starts = lineStarts(sync, source.pages * sync.linesPerPage);
  bars = starts.map((t0, i) => {
    const page = pageEls[Math.floor(i / sync.linesPerPage)];
    const el = page.appendChild(overlayEl('pdf-bar pdf-line', i, lineRect(i, sync.linesPerPage)));
    return { t0, t1: starts[i + 1] ?? t0 + lineLength(sync), sectionIndex: -1, barIndex: i, el, cols: el, chords: [] };
  });
}

function renderSync() {
  const { sync, source, audioFile } = state;
  for (const f of SYNC_FIELDS) {
    const input = $(f.id);
    if (Number(input.value) !== sync[f.key]) input.value = String(sync[f.key]);
  }
  ui.syncTap.setAttribute('aria-pressed', String(sync.tapping));
  ui.syncTaps.innerHTML = sync.taps.map((t) => `<li>${fmtTap(t)}</li>`).join('');
  ui.notice.textContent = [source.mismatch && MISMATCH, !audioFile && NEEDS_AUDIO].filter(Boolean).join(' ');
}

function renderControls() {
  const { off } = tracks(state, song);
  for (const b of ui.modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  document.documentElement.dataset.theme = state.theme;
  ui.theme.setAttribute('aria-label', state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  ui.loop.setAttribute('aria-pressed', String(state.loopSection !== null));
  ui.autoscroll.setAttribute('aria-pressed', String(state.autoscroll));
  ui.guitar.disabled = !off;
  ui.guitar.setAttribute('aria-pressed', String(state.guitar || !off));
  sections.forEach((s, i) => s.el?.classList.toggle('looping', i === state.loopSection));
  ui.rate.value = String(state.rate);
  deck.setGuitar(state.guitar);
  deck.setRate(state.rate);
  renderSeekMax();
}

function renderSeekMax() {
  ui.seek.max = duration();
}

function renderPlayButton() {
  const { paused } = deck.audible;
  ui.play.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
  ui.play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
}

function scrollToBar(i) {
  bars[i].el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function enterBar(i) {
  if (live.bar >= 0) bars[live.bar].el.classList.remove('current');
  if (live.chord) live.chord.classList.remove('current');
  live.bar = i;
  live.slot = -1;
  live.chord = null;
  if (i < 0) { cursor.remove(); return; }
  bars[i].el.classList.add('current');
  bars[i].cols.appendChild(cursor);
  if (state.autoscroll) scrollToBar(i);
}

function enterSlot(slot) {
  live.slot = slot;
  let chord = null;
  for (const c of bars[live.bar].chords) if (c.slot <= slot) chord = c.el;
  if (chord === live.chord) return;
  if (live.chord) live.chord.classList.remove('current');
  if (chord) chord.classList.add('current');
  live.chord = chord;
}

function tick() {
  requestAnimationFrame(tick);
  deck.resync();
  let t = deck.audible.currentTime;
  const loop = sections[state.loopSection];
  if (loop && t >= loop.t1) {
    deck.seek(loop.t0);
    t = loop.t0;
  }
  let i = findLast(bars, t);
  if (i >= 0 && t >= bars[i].t1) i = -1;
  if (i !== live.bar) enterBar(i);
  if (i >= 0) {
    const b = bars[i];
    const pos = Math.min(1, Math.max(0, (t - b.t0) / (b.t1 - b.t0)));
    cursor.style.transform = `translateX(${pos * SLOTS * 100}%)`;
    const slot = Math.min(SLOTS - 1, Math.floor(pos * SLOTS));
    if (slot !== live.slot) enterSlot(slot);
  }
  const time = `${fmt(t)} / ${fmt(duration())}`;
  if (time !== live.time) { ui.time.textContent = time; live.time = time; }
  ui.seek.value = t;
}

function seek(t) {
  deck.seek(Math.max(0, Math.min(duration(), t)));
}

function currentSection() {
  return findLast(sections, deck.audible.currentTime);
}

function prevSection() {
  const i = currentSection();
  if (i < 0) return seek(0);
  if (deck.audible.currentTime - sections[i].t0 > 1.5 || i === 0) seek(sections[i].t0);
  else seek(sections[i - 1].t0);
}

function nextSection() {
  const next = sections[currentSection() + 1];
  if (next) seek(next.t0);
}

function restartSection() {
  const i = currentSection();
  seek(i >= 0 ? sections[i].t0 : 0);
}

function toggleLoop() {
  const i = currentSection();
  setState({ loopSection: state.loopSection === null && i >= 0 ? i : null });
}

function togglePlay() {
  if (deck.audible.paused) deck.play();
  else deck.pause();
}

function toggleMode() {
  if (!isPdf(state)) setState({ mode: state.mode === 'played' ? 'movable' : 'played' });
}

function toggleTheme() {
  setState({ theme: state.theme === 'dark' ? 'light' : 'dark' });
}

function toggleGuitar() {
  if (tracks(state, song).off) setState({ guitar: !state.guitar });
}

function markNow() {
  if (!foreignPdf(state) || deck.audible.paused) return;
  const t = deck.audible.currentTime;
  const { sync } = state;
  setState({
    sync: sync.tapping ? { ...sync, taps: [...sync.taps, t].sort((a, b) => a - b) } : { ...sync, firstBarTime: Math.round(t * 100) / 100 },
  });
}

const toggleAutoscroll = () => setState({ autoscroll: !state.autoscroll });

const KEYS = {
  Space: togglePlay,
  ArrowLeft: () => seek(deck.audible.currentTime - 5),
  ArrowRight: () => seek(deck.audible.currentTime + 5),
  'Shift+ArrowLeft': prevSection,
  'Shift+ArrowRight': nextSection,
  KeyL: toggleLoop,
  KeyM: toggleMode,
  KeyD: toggleTheme,
  KeyA: toggleAutoscroll,
  KeyG: toggleGuitar,
  KeyT: markNow,
};

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, select, textarea')) return;
  const action = KEYS[(e.shiftKey ? 'Shift+' : '') + e.code];
  if (!action || !(song || isPdf(state))) return;
  e.preventDefault();
  action();
}

function onUserScroll() {
  if (!deck.audible.paused && state.autoscroll) setState({ autoscroll: false });
}

function showSong(songId) {
  pdfDoc?.destroy();
  pdfDoc = null;
  ui.pages.replaceChildren();
  if (state.audioFile) URL.revokeObjectURL(state.audioFile.url);
  setState({ source: SONG_SOURCE, songId, loopSection: null, audioFile: null });
}

function openAudio(file) {
  if (state.audioFile) URL.revokeObjectURL(state.audioFile.url);
  const t = deck.audible.currentTime;
  setState({ audioFile: { url: URL.createObjectURL(file), name: file.name } });
  if (isPdf(state)) deck.seek(t);
}

function loadPdfjs() {
  pdfjsReady ??= import('./vendor/pdfjs/pdf.min.mjs').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';
    return pdfjs;
  });
  return pdfjsReady;
}

async function renderPage(page, n, cssWidth) {
  const viewport = page.getViewport({ scale: cssWidth / page.getViewport({ scale: 1 }).width });
  const dpr = Math.min(devicePixelRatio, 4096 / Math.max(viewport.width, viewport.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${cssWidth}px`;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
  page.cleanup();
  const el = document.createElement('div');
  el.className = 'page';
  el.dataset.page = n;
  el.append(canvas);
  return el;
}

async function renderPages(doc) {
  const cssWidth = ui.pages.clientWidth;
  try {
    for (let n = 1; n <= doc.numPages && pdfDoc === doc; n++) {
      const el = await renderPage(await doc.getPage(n), n, cssWidth);
      if (pdfDoc === doc) ui.pages.append(el);
    }
  } catch (e) {
    if (pdfDoc === doc) throw e;
  }
}

async function openPdf(file) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const { info } = await doc.getMetadata();
  pdfDoc?.destroy();
  pdfDoc = doc;
  ui.pages.replaceChildren();
  const source = pdfSource(file, doc.numPages, parseMeta(info.Subject), songs);
  setState({ source, sync: recallSync(source), loopSection: null });
  await renderPages(doc);
  if (pdfDoc === doc) renderOverlays();
}

async function openEach(files) {
  const audio = files.findLast(isAudioFile);
  const pdf = files.findLast(isPdfFile);
  if (audio) openAudio(audio);
  if (pdf) await openPdf(pdf);
}

async function openFiles(files) {
  const run = opening.then(() => openEach([...files]));
  opening = run.catch(() => {});
  return run;
}

function bindFiles() {
  $('open-files').addEventListener('click', () => ui.fileInput.click());
  ui.fileInput.addEventListener('change', () => {
    openFiles([...ui.fileInput.files]);
    ui.fileInput.value = '';
  });
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) document.body.classList.remove('dragging');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    openFiles(e.dataTransfer.files);
  });
}

function bindSync() {
  for (const f of SYNC_FIELDS) {
    $(f.id).addEventListener('input', (e) => {
      const v = Number(e.target.value);
      if (validSync(f, v)) setState({ sync: { ...state.sync, [f.key]: v } });
    });
  }
  $('sync-now').addEventListener('click', markNow);
  ui.syncTap.addEventListener('click', () => setState({ sync: { ...state.sync, tapping: !state.sync.tapping } }));
  $('sync-clear').addEventListener('click', () => setState({ sync: { ...state.sync, taps: [] } }));
}

function bind() {
  ui.songs.addEventListener('click', (e) => {
    const el = e.target.closest('.song');
    if (el) showSong(songs[el.dataset.index].id);
  });
  ui.tab.addEventListener('click', (e) => {
    const bar = e.target.closest('.bar');
    const head = e.target.closest('.section-head');
    if (bar) seek(bars[bar.dataset.index].t0);
    else if (head) seek(sections[head.dataset.index].t0);
  });
  ui.pages.addEventListener('click', (e) => {
    const bar = e.target.closest('.pdf-bar');
    if (bar) seek(bars[bar.dataset.index].t0);
  });
  for (const b of ui.modeButtons) b.addEventListener('click', () => setState({ mode: b.dataset.mode }));
  ui.play.addEventListener('click', togglePlay);
  $('back').addEventListener('click', KEYS.ArrowLeft);
  $('fwd').addEventListener('click', KEYS.ArrowRight);
  $('prev').addEventListener('click', prevSection);
  $('next').addEventListener('click', nextSection);
  $('restart').addEventListener('click', restartSection);
  ui.loop.addEventListener('click', toggleLoop);
  ui.autoscroll.addEventListener('click', toggleAutoscroll);
  ui.guitar.addEventListener('click', toggleGuitar);
  ui.theme.addEventListener('click', toggleTheme);
  ui.rate.addEventListener('change', () => setState({ rate: Number(ui.rate.value) }));
  ui.seek.addEventListener('input', () => seek(Number(ui.seek.value)));
  for (const el of [deck.full, deck.bed]) {
    el.addEventListener('play', renderPlayButton);
    el.addEventListener('pause', renderPlayButton);
    el.addEventListener('loadedmetadata', renderSeekMax);
  }
  ui.main.addEventListener('wheel', onUserScroll, { passive: true });
  ui.main.addEventListener('touchmove', onUserScroll, { passive: true });
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && e.target.closest('button')) e.preventDefault();
  });
  bindFiles();
  bindSync();
}

async function init() {
  songs = await (await fetch('data/songs.json')).json();
  ui.songs.insertAdjacentHTML('beforeend', songs
    .map((s, i) => `<button type="button" class="song" data-index="${i}"><span class="song-title">${esc(s.title)}</span>` +
      `<span class="song-meta">${esc(s.key)} · ${esc(s.tempo)}</span></button>`)
    .join(''));
  const savedId = recall('tabplayer.songId');
  const savedMode = recall('tabplayer.mode');
  const theme = document.documentElement.dataset.theme;
  bind();
  renderPlayButton();
  setState({
    songId: songs.some((s) => s.id === savedId) ? savedId : songs[0].id,
    mode: MODES.includes(savedMode) ? savedMode : 'played',
    theme: THEMES.includes(theme) ? theme : 'light',
    guitar: recall('tabplayer.guitar') !== 'off',
  });
  requestAnimationFrame(tick);
}

init();
