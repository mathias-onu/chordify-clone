const SLOTS = 16;
const BEATS = ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a'];
const MODES = ['played', 'movable'];
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

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const ui = {
  songs: $('songs'), main: $('main'), title: $('title'), meta: $('meta'), notes: $('notes'),
  shapes: $('shapes'), tab: $('tab'), play: $('play'), loop: $('loop'), rate: $('rate'),
  seek: $('seek'), time: $('time'), autoscroll: $('autoscroll'),
  modeButtons: [...document.querySelectorAll('[data-mode]')],
};
const cursor = Object.assign(document.createElement('div'), { className: 'cursor' });

let songs = [];
let song = null;
let bars = [];
let sections = [];
let live = { bar: -1, slot: -1, chord: null, time: '' };
let state = { songId: null, mode: 'played', loopSection: null, autoscroll: true, rate: 1 };

function store(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function setState(patch) {
  const prev = state;
  state = { ...state, ...patch };
  store('tabplayer.songId', state.songId);
  store('tabplayer.mode', state.mode);
  if (state.songId !== prev.songId) loadSong();
  else if (state.mode !== prev.mode) renderSong();
  if (state.autoscroll && !prev.autoscroll && live.bar >= 0) scrollToBar(live.bar);
  renderControls();
}

function loadSong() {
  song = songs.find((s) => s.id === state.songId);
  audio.src = encodeURI(song.audio);
  ui.seek.max = song.duration;
  for (const el of ui.songs.children) el.classList.toggle('active', songs[el.dataset.index] === song);
  renderSong();
}

function renderSong() {
  ui.title.textContent = song.title;
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
  cursor.remove();
  live = { bar: -1, slot: -1, chord: null, time: '' };
  document.title = `${song.title} · Tab Player`;
}

function renderControls() {
  for (const b of ui.modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  ui.loop.setAttribute('aria-pressed', String(state.loopSection !== null));
  ui.autoscroll.setAttribute('aria-pressed', String(state.autoscroll));
  sections.forEach((s, i) => s.el.classList.toggle('looping', i === state.loopSection));
  ui.rate.value = String(state.rate);
  audio.playbackRate = state.rate;
  audio.defaultPlaybackRate = state.rate;
}

function renderPlayButton() {
  ui.play.innerHTML = audio.paused ? ICON_PLAY : ICON_PAUSE;
  ui.play.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
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
  if (!song) return;
  let t = audio.currentTime;
  const loop = sections[state.loopSection];
  if (loop && t >= loop.t1) {
    audio.currentTime = loop.t0;
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
  const time = `${fmt(t)} / ${fmt(song.duration)}`;
  if (time !== live.time) { ui.time.textContent = time; live.time = time; }
  ui.seek.value = t;
}

function seek(t) {
  audio.currentTime = Math.max(0, Math.min(song.duration, t));
}

function currentSection() {
  return findLast(sections, audio.currentTime);
}

function prevSection() {
  const i = currentSection();
  if (i < 0) return seek(0);
  if (audio.currentTime - sections[i].t0 > 1.5 || i === 0) seek(sections[i].t0);
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
  if (audio.paused) audio.play();
  else audio.pause();
}

const toggleMode = () => setState({ mode: state.mode === 'played' ? 'movable' : 'played' });
const toggleAutoscroll = () => setState({ autoscroll: !state.autoscroll });

const KEYS = {
  Space: togglePlay,
  ArrowLeft: () => seek(audio.currentTime - 5),
  ArrowRight: () => seek(audio.currentTime + 5),
  'Shift+ArrowLeft': prevSection,
  'Shift+ArrowRight': nextSection,
  KeyL: toggleLoop,
  KeyM: toggleMode,
  KeyA: toggleAutoscroll,
};

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, select, textarea')) return;
  const action = KEYS[(e.shiftKey ? 'Shift+' : '') + e.code];
  if (!action || !song) return;
  e.preventDefault();
  action();
}

function onUserScroll() {
  if (!audio.paused && state.autoscroll) setState({ autoscroll: false });
}

function bind() {
  ui.songs.addEventListener('click', (e) => {
    const el = e.target.closest('[data-index]');
    if (el) setState({ songId: songs[el.dataset.index].id, loopSection: null });
  });
  ui.tab.addEventListener('click', (e) => {
    const bar = e.target.closest('.bar');
    const head = e.target.closest('.section-head');
    if (bar) seek(bars[bar.dataset.index].t0);
    else if (head) seek(sections[head.dataset.index].t0);
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
  ui.rate.addEventListener('change', () => setState({ rate: Number(ui.rate.value) }));
  ui.seek.addEventListener('input', () => seek(Number(ui.seek.value)));
  audio.addEventListener('play', renderPlayButton);
  audio.addEventListener('pause', renderPlayButton);
  ui.main.addEventListener('wheel', onUserScroll, { passive: true });
  ui.main.addEventListener('touchmove', onUserScroll, { passive: true });
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && e.target.closest('button')) e.preventDefault();
  });
}

async function init() {
  songs = await (await fetch('data/songs.json')).json();
  ui.songs.innerHTML = songs
    .map((s, i) => `<button type="button" class="song" data-index="${i}"><span class="song-title">${esc(s.title)}</span>` +
      `<span class="song-meta">${esc(s.key)} · ${esc(s.tempo)}</span></button>`)
    .join('');
  const savedId = recall('tabplayer.songId');
  const savedMode = recall('tabplayer.mode');
  bind();
  renderPlayButton();
  setState({
    songId: songs.some((s) => s.id === savedId) ? savedId : songs[0].id,
    mode: MODES.includes(savedMode) ? savedMode : 'played',
  });
  requestAnimationFrame(tick);
}

init();
